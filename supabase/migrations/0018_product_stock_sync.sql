-- ============================================================================
-- 0018 — PRODUCT ↔ INVENTORY AVAILABILITY SYNC
-- Customer-facing products linked to an inventory item mirror its real
-- availability in products.stock_status. Customers never read inventory
-- tables directly; the derived status is pushed into the product row.
-- ============================================================================

create or replace function public.fn_derived_stock_status(
  p_available numeric, p_reorder numeric
) returns text language sql immutable as $$
  select case
    when p_available <= 0 then 'out_of_stock'
    when p_available <= p_reorder then 'low_stock'
    else 'in_stock'
  end;
$$;

-- Quantity or reorder-level changes flow to every linked product.
create or replace function public.sync_linked_product_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.products p
  set stock_status =
        public.fn_derived_stock_status(new.quantity_available, new.reorder_level)
  where p.inventory_item_id = new.id
    and p.stock_status is distinct from
        public.fn_derived_stock_status(new.quantity_available, new.reorder_level);
  return new;
end $$;

drop trigger if exists trg_sync_product_stock on public.inventory_items;
create trigger trg_sync_product_stock
after update of quantity_on_hand, quantity_reserved, reorder_level
on public.inventory_items
for each row execute function public.sync_linked_product_stock();

-- Linking (or re-linking) a product pulls the current status immediately.
create or replace function public.sync_product_stock_on_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  if new.inventory_item_id is null then return new; end if;
  select quantity_available, reorder_level into v
  from public.inventory_items where id = new.inventory_item_id;
  if found then
    new.stock_status :=
      public.fn_derived_stock_status(v.quantity_available, v.reorder_level);
  end if;
  return new;
end $$;

drop trigger if exists trg_product_stock_on_link on public.products;
create trigger trg_product_stock_on_link
before insert or update of inventory_item_id on public.products
for each row execute function public.sync_product_stock_on_link();

-- Backfill already-linked products.
update public.products p
set stock_status = public.fn_derived_stock_status(i.quantity_available, i.reorder_level)
from public.inventory_items i
where p.inventory_item_id = i.id;

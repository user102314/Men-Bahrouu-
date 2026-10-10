CREATE OR REPLACE FUNCTION stock_movements_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_no_update
BEFORE UPDATE ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION stock_movements_immutable();
--> statement-breakpoint
CREATE TRIGGER stock_movements_no_delete
BEFORE DELETE ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION stock_movements_immutable();

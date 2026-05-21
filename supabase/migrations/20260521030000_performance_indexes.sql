-- Performance indexes for the main tables
-- Pro plan: no storage concerns, indexes improve query speed significantly

-- Products
CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products (supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_has_color_variants ON products (has_color_variants) WHERE has_color_variants = true;

-- Product color stock (variants)
CREATE INDEX IF NOT EXISTS idx_product_color_stock_product_id ON product_color_stock (product_id);

-- Stock movements
CREATE INDEX IF NOT EXISTS idx_stock_movements_log_product_id ON stock_movements_log (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_log_created_at ON stock_movements_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_log_source ON stock_movements_log (source);

-- Receipts (POS)
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_client_id ON receipts (client_id);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts (status);

-- Reservations
CREATE INDEX IF NOT EXISTS idx_reservations_client_name ON reservations (client_name);
CREATE INDEX IF NOT EXISTS idx_reservations_reservation_status ON reservations (reservation_status);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON reservations (created_at DESC);

-- Supplier orders
CREATE INDEX IF NOT EXISTS idx_fo_orders_supplier_id ON fo_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_fo_orders_order_status ON fo_orders (order_status);
CREATE INDEX IF NOT EXISTS idx_fo_orders_created_at ON fo_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fo_order_lines_order_id ON fo_order_lines (order_id);
CREATE INDEX IF NOT EXISTS idx_fo_order_lines_product_id ON fo_order_lines (product_id);

-- Supplier messages
CREATE INDEX IF NOT EXISTS idx_supplier_messages_supplier_id ON supplier_messages (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_messages_created_at ON supplier_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_messages_is_read ON supplier_messages (is_read) WHERE is_read = false;

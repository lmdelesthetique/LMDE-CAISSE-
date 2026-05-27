alter table categories
  add column if not exists visible_in_client_portal boolean not null default false;

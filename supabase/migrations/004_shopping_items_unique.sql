alter table shopping_items
  add constraint shopping_items_family_id_name_key unique (family_id, name);

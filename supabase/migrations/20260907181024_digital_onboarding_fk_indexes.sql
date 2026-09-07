create index advertiser_orders_advertiser_business_fk_idx on public.advertiser_orders(advertiser_business_id);
create index advertiser_orders_campaign_fk_idx on public.advertiser_orders(campaign_id) where campaign_id is not null;
create index advertiser_orders_created_by_fk_idx on public.advertiser_orders(created_by) where created_by is not null;
create index advertiser_orders_invoice_fk_idx on public.advertiser_orders(invoice_id) where invoice_id is not null;
create index advertiser_orders_package_fk_idx on public.advertiser_orders(package_id) where package_id is not null;

create index advertising_packages_created_by_fk_idx on public.advertising_packages(created_by) where created_by is not null;

create index agreement_instances_business_fk_idx on public.agreement_instances(business_id);
create index agreement_instances_created_by_fk_idx on public.agreement_instances(created_by) where created_by is not null;
create index agreement_instances_location_fk_idx on public.agreement_instances(location_id) where location_id is not null;
create index agreement_instances_supersedes_fk_idx on public.agreement_instances(supersedes_agreement_id) where supersedes_agreement_id is not null;
create index agreement_instances_template_fk_idx on public.agreement_instances(template_id);

create index agreement_templates_created_by_fk_idx on public.agreement_templates(created_by) where created_by is not null;

create index onboarding_tasks_advertiser_order_fk_idx on public.onboarding_tasks(advertiser_order_id) where advertiser_order_id is not null;
create index onboarding_tasks_agreement_instance_fk_idx on public.onboarding_tasks(agreement_instance_id) where agreement_instance_id is not null;
create index onboarding_tasks_assigned_to_fk_idx on public.onboarding_tasks(assigned_to) where assigned_to is not null;
create index onboarding_tasks_business_fk_idx on public.onboarding_tasks(business_id) where business_id is not null;
create index onboarding_tasks_campaign_fk_idx on public.onboarding_tasks(campaign_id) where campaign_id is not null;
create index onboarding_tasks_location_fk_idx on public.onboarding_tasks(location_id) where location_id is not null;

create index onboarding_tokens_advertiser_order_fk_idx on public.onboarding_tokens(advertiser_order_id) where advertiser_order_id is not null;
create index onboarding_tokens_business_fk_idx on public.onboarding_tokens(business_id) where business_id is not null;
create index onboarding_tokens_created_by_fk_idx on public.onboarding_tokens(created_by) where created_by is not null;
create index onboarding_tokens_location_fk_idx on public.onboarding_tokens(location_id) where location_id is not null;

create index placement_authorizations_business_fk_idx on public.placement_authorizations(business_id);
create index placement_authorizations_location_fk_idx on public.placement_authorizations(location_id);
create index placement_authorizations_organization_fk_idx on public.placement_authorizations(organization_id);
create index placement_authorizations_screen_fk_idx on public.placement_authorizations(screen_id) where screen_id is not null;
create index placement_authorizations_zone_fk_idx on public.placement_authorizations(zone_id) where zone_id is not null;

-- Créer l'entreprise LS Consulting (admin)
INSERT INTO public.companies (
  id,
  name,
  subscription_status,
  subscription_plan,
  primary_color
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'LS Consulting',
  'active',
  'enterprise',
  '#dc2626'
) ON CONFLICT (id) DO NOTHING;

-- Mettre à jour le profil admin après inscription manuelle
-- (À exécuter APRÈS avoir créé le compte admin@lsconsulting.com via l'interface)
-- UPDATE public.profiles 
-- SET role = 'admin_platform', company_id = '00000000-0000-0000-0000-000000000001'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@lsconsulting.com');

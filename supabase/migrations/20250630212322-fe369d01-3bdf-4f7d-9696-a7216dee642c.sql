
-- Reverter a policy para não permitir que pacientes vejam as configurações do WhatsApp
DROP POLICY IF EXISTS "Users can view whatsapp settings" ON public.whatsapp_settings;

-- Policy original - apenas usuários da clínica e super admin podem ver configurações
CREATE POLICY "Users can view whatsapp settings" 
  ON public.whatsapp_settings 
  FOR SELECT
  USING (
    -- Super admin pode ver todas
    get_current_user_role() = 'super_admin' OR
    -- Usuários de clínica (admin, professional, clinic) podem ver suas configurações
    (get_current_user_role() IN ('admin', 'professional', 'clinic') AND clinic_id = get_current_user_clinic_id()) OR
    -- Usuários podem ver configurações globais (clinic_id IS NULL) como fallback
    (get_current_user_role() IN ('admin', 'professional', 'clinic') AND clinic_id IS NULL)
  );

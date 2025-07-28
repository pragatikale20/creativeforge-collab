-- Fix security definer functions with proper search paths

-- Update get_user_role function
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT role FROM public.profiles WHERE id = $1;
$$;

-- Update is_user_assigned_to_project function
CREATE OR REPLACE FUNCTION public.is_user_assigned_to_project(user_id UUID, project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.project_assignments 
        WHERE user_id = $1 AND project_id = $2
    );
$$;

-- Update is_project_lead function
CREATE OR REPLACE FUNCTION public.is_project_lead(user_id UUID, project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.projects 
        WHERE project_lead_id = $1 AND id = $2
    );
$$;

-- Update update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
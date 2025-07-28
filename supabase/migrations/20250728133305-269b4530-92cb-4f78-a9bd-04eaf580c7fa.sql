-- Create user role enum
CREATE TYPE public.user_role AS ENUM ('admin', 'project_lead', 'developer');

-- Create profiles table for user information
CREATE TABLE public.profiles (
    id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'developer',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create projects table
CREATE TABLE public.projects (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    deadline DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    project_lead_id UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create project assignments table (many-to-many between users and projects)
CREATE TABLE public.project_assignments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(project_id, user_id)
);

-- Create documents table for file uploads
CREATE TABLE public.project_documents (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

-- Create security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT role FROM public.profiles WHERE id = user_id;
$$;

-- Create function to check if user is assigned to project
CREATE OR REPLACE FUNCTION public.is_user_assigned_to_project(user_id UUID, project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.project_assignments 
        WHERE user_id = $1 AND project_id = $2
    );
$$;

-- Create function to check if user is project lead
CREATE OR REPLACE FUNCTION public.is_project_lead(user_id UUID, project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.projects 
        WHERE project_lead_id = $1 AND id = $2
    );
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can insert profiles" ON public.profiles
    FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- RLS Policies for projects
CREATE POLICY "All users can view active projects" ON public.projects
    FOR SELECT USING (status = 'active');

CREATE POLICY "Admins can manage all projects" ON public.projects
    FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Project leads can view their projects" ON public.projects
    FOR SELECT USING (project_lead_id = auth.uid());

-- RLS Policies for project assignments
CREATE POLICY "Users can view assignments for their projects" ON public.project_assignments
    FOR SELECT USING (
        user_id = auth.uid() OR 
        public.get_user_role(auth.uid()) = 'admin' OR
        public.is_project_lead(auth.uid(), project_id)
    );

CREATE POLICY "Project leads can assign users to their projects" ON public.project_assignments
    FOR INSERT WITH CHECK (
        public.get_user_role(auth.uid()) = 'admin' OR
        public.is_project_lead(auth.uid(), project_id)
    );

CREATE POLICY "Project leads can remove assignments from their projects" ON public.project_assignments
    FOR DELETE USING (
        public.get_user_role(auth.uid()) = 'admin' OR
        public.is_project_lead(auth.uid(), project_id)
    );

-- RLS Policies for documents
CREATE POLICY "Users can view documents for assigned projects" ON public.project_documents
    FOR SELECT USING (
        public.get_user_role(auth.uid()) = 'admin' OR
        public.is_project_lead(auth.uid(), project_id) OR
        public.is_user_assigned_to_project(auth.uid(), project_id)
    );

CREATE POLICY "Admins and project leads can upload documents" ON public.project_documents
    FOR INSERT WITH CHECK (
        public.get_user_role(auth.uid()) = 'admin' OR
        public.is_project_lead(auth.uid(), project_id)
    );

-- Create storage bucket for project documents
INSERT INTO storage.buckets (id, name, public) VALUES ('project-documents', 'project-documents', false);

-- Storage policies for documents
CREATE POLICY "Users can view documents for assigned projects" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'project-documents' AND (
            public.get_user_role(auth.uid()) = 'admin' OR
            EXISTS (
                SELECT 1 FROM public.project_documents pd
                JOIN public.projects p ON pd.project_id = p.id
                WHERE pd.file_path = name AND (
                    p.project_lead_id = auth.uid() OR
                    public.is_user_assigned_to_project(auth.uid(), p.id)
                )
            )
        )
    );

CREATE POLICY "Admins and project leads can upload documents" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'project-documents' AND (
            public.get_user_role(auth.uid()) = 'admin' OR
            EXISTS (
                SELECT 1 FROM public.projects p
                WHERE p.project_lead_id = auth.uid()
            )
        )
    );

-- Create function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
        'developer'
    );
    RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
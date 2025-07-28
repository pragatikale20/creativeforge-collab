import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Users, FileText, Settings, LogOut } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Navigate } from 'react-router-dom';

interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string;
  status: string;
  project_lead_id: string;
  profiles: { full_name: string } | null;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function Dashboard() {
  const { user, userRole, signOut, loading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (user && userRole) {
      fetchDashboardData();
    }
  }, [user, userRole]);

  const fetchDashboardData = async () => {
    try {
      // Fetch projects based on role
      if (userRole === 'admin') {
        const { data: allProjects } = await supabase
          .from('projects')
          .select(`
            *,
            project_lead:profiles!projects_project_lead_id_fkey(full_name)
          `)
          .order('created_at', { ascending: false });
        
        setProjects(allProjects?.map(p => ({
          ...p,
          profiles: p.project_lead
        })) || []);

        // Fetch all profiles for admin
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('*')
          .order('full_name');
        
        setProfiles(allProfiles || []);
      } else if (userRole === 'project_lead') {
        // Fetch projects where user is project lead
        const { data: ledProjects } = await supabase
          .from('projects')
          .select(`
            *,
            project_lead:profiles!projects_project_lead_id_fkey(full_name)
          `)
          .eq('project_lead_id', user!.id)
          .order('created_at', { ascending: false });
        
        setProjects(ledProjects?.map(p => ({
          ...p,
          profiles: p.project_lead
        })) || []);
      }

      // Fetch assigned projects for all users
      const { data: assignments } = await supabase
        .from('project_assignments')
        .select(`
          projects!inner (
            *,
            project_lead:profiles!projects_project_lead_id_fkey(full_name)
          )
        `)
        .eq('user_id', user!.id);

      const assignedProjectsList = assignments?.map(a => ({
        ...a.projects,
        profiles: a.projects.project_lead
      })).filter(Boolean) || [];
      setAssignedProjects(assignedProjectsList as Project[]);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  if (loading || !user) {
    return <Navigate to="/auth" replace />;
  }

  if (loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200';
      case 'project_lead': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'developer': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                PixelForge Nexus
              </h1>
              <p className="text-muted-foreground">Welcome back, {user?.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={getRoleBadgeColor(userRole || '')}>
                {userRole?.replace('_', ' ').toUpperCase()}
              </Badge>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8">
          {/* Admin Section */}
          {userRole === 'admin' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Admin Dashboard</h2>
                <div className="flex gap-2">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Project
                  </Button>
                  <Button variant="outline">
                    <Users className="h-4 w-4 mr-2" />
                    Manage Users
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <Card key={project.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                          {project.status}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Due: {project.deadline ? new Date(project.deadline).toLocaleDateString() : 'No deadline'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>Lead: {project.profiles?.full_name || 'Unassigned'}</span>
                        </div>
                      </div>
                      <Button className="w-full mt-4" variant="outline">
                        <FileText className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Project Lead Section */}
          {userRole === 'project_lead' && projects.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Your Projects</h2>
                <Button variant="outline">
                  <Users className="h-4 w-4 mr-2" />
                  Manage Team
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <Card key={project.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                          {project.status}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Due: {project.deadline ? new Date(project.deadline).toLocaleDateString() : 'No deadline'}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button className="flex-1" variant="outline">
                          <FileText className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                        <Button className="flex-1">
                          <Plus className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Assigned Projects Section */}
          {assignedProjects.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Assigned Projects</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {assignedProjects.map((project) => (
                  <Card key={project.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                          {project.status}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Due: {project.deadline ? new Date(project.deadline).toLocaleDateString() : 'No deadline'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>Lead: {project.profiles?.full_name || 'Unassigned'}</span>
                        </div>
                      </div>
                      <Button className="w-full mt-4" variant="outline">
                        <FileText className="h-4 w-4 mr-2" />
                        View Documents
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {assignedProjects.length === 0 && projects.length === 0 && (
            <div className="text-center py-12">
              <div className="mx-auto h-24 w-24 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No Projects Yet</h3>
              <p className="text-muted-foreground mb-4">
                {userRole === 'admin' 
                  ? "Start by creating your first project"
                  : "You haven't been assigned to any projects yet"
                }
              </p>
              {userRole === 'admin' && (
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
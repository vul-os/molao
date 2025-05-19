import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Search, 
  UserPlus, 
  Mail, 
  MoreHorizontal, 
  UserCheck, 
  UserX, 
  Shield, 
  User,
  Filter
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from '@/services/supabase-client';
import { motion } from "framer-motion";

export default function MembersPage() {
  const { activeFirm, user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  useEffect(() => {
    if (activeFirm) {
      fetchMembers();
    }
  }, [activeFirm]);

  const fetchMembers = async () => {
    if (!activeFirm) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('firm_members')
        .select(`
          *,
          profiles:profile_id (
            id,
            email,
            full_name,
            avatar_url,
            username
          )
        `)
        .eq('firm_id', activeFirm.id);

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to fetch members');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail || !activeFirm) return;

    try {
      const response = await fetch('/api/invite-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.access_token}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          firmId: activeFirm.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invite');
      }

      toast.success('Invitation sent successfully');
      setIsInviteDialogOpen(false);
      setInviteEmail('');
    } catch (error) {
      console.error('Error sending invite:', error);
      toast.error(error.message || 'Failed to send invitation');
    }
  };

  const getInitials = (name) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getFirstLetter = (name, email) => {
    if (name) {
      return name.trim()[0].toUpperCase();
    } else if (email) {
      return email.split('@')[0][0].toUpperCase();
    } else {
      return '?';
    }
  };

  const getDisplayName = (profile) => {
    if (profile?.full_name) {
      return profile.full_name;
    } else if (profile?.email) {
      return profile.email.split('@')[0];
    } else {
      return 'Unnamed User';
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'member':
        return 'bg-slate-50 text-slate-800 border-slate-200';
      default:
        return 'bg-gray-50 text-gray-800 border-gray-200';
    }
  };

  const getRoleIcon = (role) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return <Shield className="h-3 w-3 mr-1" />;
      case 'member':
        return <User className="h-3 w-3 mr-1" />;
      default:
        return null;
    }
  };

  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      const matchesSearch = 
        !searchQuery || 
        member.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.profiles?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.profiles?.username?.toLowerCase().includes(searchQuery.toLowerCase());
        
      const matchesRole = 
        roleFilter === 'all' || 
        member.role.toLowerCase() === roleFilter.toLowerCase();
        
      return matchesSearch && matchesRole;
    });
  }, [members, searchQuery, roleFilter]);

  const partnersCount = useMemo(() => 
    members.filter(m => m.role.toLowerCase() === 'admin').length,
  [members]);

  const associatesCount = useMemo(() => 
    members.filter(m => m.role.toLowerCase() === 'member').length,
  [members]);

  const removeUser = async (memberId) => {
    try {
      const { error } = await supabase
        .from('firm_members')
        .delete()
        .eq('id', memberId);
      
      if (error) throw error;
      toast.success('Member removed successfully');
      fetchMembers();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
    }
  };

  const changeRole = async (memberId, newRole) => {
    try {
      const { error } = await supabase
        .from('firm_members')
        .update({ role: newRole })
        .eq('id', memberId);
      
      if (error) throw error;
      toast.success(`Role updated to ${newRole}`);
      fetchMembers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    }
  };

  // Loading Skeleton
  if (loading) {
    return (
      <div className="container mx-auto py-10 px-4 md:px-6">
        <div className="flex justify-between items-center mb-8">
          <div className="h-8 w-32 bg-gray-200 rounded-md animate-pulse"></div>
          <div className="h-10 w-32 bg-gray-200 rounded-md animate-pulse"></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 rounded-full bg-gray-300"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4 md:px-6">
      <div className="flex flex-col space-y-8">
        {/* Header Section */}
        <header className="border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-serif font-medium text-slate-800">Directory</h1>
          <p className="text-slate-500 mt-1">
            {activeFirm?.name || "Your Firm"} — {partnersCount} Partner{partnersCount !== 1 ? 's' : ''} and {associatesCount} Associate{associatesCount !== 1 ? 's' : ''}
          </p>
        </header>

        {/* Search & Filter Bar */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex gap-4 items-center flex-wrap w-full lg:w-auto">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
              <Input
                className="pl-10 bg-white border-slate-200 text-slate-800 w-full focus-visible:ring-slate-400"
                placeholder="Search associates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2 items-center">
              <span className="text-slate-500 text-sm flex items-center">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                Filter:
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={`rounded-full text-xs py-1 px-3 ${
                    roleFilter === 'all' 
                      ? 'bg-slate-100 border-slate-300 font-medium' 
                      : 'bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => setRoleFilter('all')}
                >
                  All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`rounded-full text-xs py-1 px-3 flex items-center ${
                    roleFilter === 'admin' 
                      ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium' 
                      : 'bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => setRoleFilter('admin')}
                >
                  <Shield className="h-3 w-3 mr-1.5" />
                  Partners
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`rounded-full text-xs py-1 px-3 flex items-center ${
                    roleFilter === 'member' 
                      ? 'bg-slate-100 border-slate-300 text-slate-800 font-medium' 
                      : 'bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => setRoleFilter('member')}
                >
                  <User className="h-3 w-3 mr-1.5" />
                  Associates
                </Button>
              </div>
            </div>
          </div>
          
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-slate-800 hover:bg-slate-700">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Associate
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif">Invite an Associate</DialogTitle>
                <DialogDescription>
                  Enter the email address of the person you want to invite to {activeFirm?.name || "your firm"}.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 h-4 w-4" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="associate@example.com"
                      className="pl-10"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button className="bg-slate-800 hover:bg-slate-700" onClick={handleInvite}>
                  Send Invitation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Members Grid */}
        <div className="pt-4">
          {filteredMembers.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredMembers.map((member, index) => (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`bg-white rounded-md border hover:border-slate-300 transition-all duration-200 p-6 ${
                    member.role === 'admin' 
                      ? 'border-amber-200 shadow-sm' 
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <Avatar className={`h-14 w-14 ${
                        member.role === 'admin'
                          ? 'border-2 border-amber-200'
                          : 'border border-slate-200'
                      }`}>
                        <AvatarImage src={member.profiles?.avatar_url} />
                        <AvatarFallback className={`${
                          member.role === 'admin'
                            ? 'bg-amber-800 text-white'
                            : 'bg-slate-700 text-white'
                        } font-serif`}>
                          {getFirstLetter(member.profiles?.full_name, member.profiles?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-serif font-medium text-lg text-slate-800">
                            {getDisplayName(member.profiles)}
                          </h3>
                          <Badge variant="outline" className={`rounded-sm text-xs h-5 flex items-center ${getRoleBadgeColor(member.role)}`}>
                            {getRoleIcon(member.role)}
                            {member.role === 'admin' ? 'Partner' : 'Associate'}
                          </Badge>
                        </div>
                        <p className="text-slate-500 text-sm">{member.profiles?.email}</p>
                      </div>
                    </div>
                    
                    {user?.id !== member.profile_id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border border-slate-200">
                          {member.role !== 'admin' && (
                            <DropdownMenuItem onClick={() => changeRole(member.id, 'admin')}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Make Partner
                            </DropdownMenuItem>
                          )}
                          {member.role !== 'member' && (
                            <DropdownMenuItem onClick={() => changeRole(member.id, 'member')}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Make Associate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            className="text-red-600 focus:text-red-600"
                            onClick={() => removeUser(member.id)}
                          >
                            <UserX className="h-4 w-4 mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-slate-400 text-xs font-medium">
                      Member since {new Date(member.created_at).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 bg-slate-50 border border-slate-200 rounded-md"
            >
              <div className="mx-auto w-16 h-16 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center mb-4">
                <UserPlus className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-serif font-medium text-slate-800">No associates found</h3>
              <p className="mt-1 text-sm text-slate-500">
                {searchQuery || roleFilter !== 'all'
                  ? `No results match your current filters`
                  : "Invite associates to your firm to get started"}
              </p>
              <Button 
                onClick={() => setIsInviteDialogOpen(true)} 
                className="mt-4 bg-slate-800 hover:bg-slate-700"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Associates
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  Filter,
  Clock,
  Mail as MailIcon
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
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('associate');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  useEffect(() => {
    if (activeFirm) {
      fetchMembers();
      fetchPendingInvites();
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

  const fetchPendingInvites = async () => {
    if (!activeFirm) return;
    
    try {
      const { data, error } = await supabase
        .from('firm_invites')
        .select(`
          *,
          inviter:invited_by (
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('firm_id', activeFirm.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingInvites(data || []);
    } catch (error) {
      console.error('Error fetching pending invites:', error);
      toast.error('Failed to fetch pending invites');
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail || !activeFirm) return;

    try {
      setInviteLoading(true);
      
      // Get the current session (either refreshed or existing)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('Current session state:', {
        hasSession: !!session,
        error: sessionError?.message,
        expiresAt: session?.expires_at,
        currentTime: Math.floor(Date.now() / 1000)
      });
      
       // Format the token properly if it's not already
      const authToken = session?.access_token.startsWith('Bearer ') ?  session?.access_token : `Bearer ${ session?.access_token}`;

      const response = await fetch('https://gxwpvpqatisvkpgpstst.supabase.co/functions/v1/invite-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
        },
        body: JSON.stringify({
          email: inviteEmail,
          firmId: activeFirm.id,
          role: inviteRole,
        }),
      });

      const data = await response.json();
      console.log('Response details:', {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        data
      });

      if (!response.ok) {
        // Add more context to the error
        const errorMessage = data.error || 'Failed to send invite';
        const errorDetails = data.details ? `\nDetails: ${JSON.stringify(data.details)}` : '';
        throw new Error(`${errorMessage}${errorDetails}`);
      }

      toast.success('Invitation sent successfully');
      setIsInviteDialogOpen(false);
      setInviteEmail('');
      setInviteRole('associate');
      // Refresh the members list to show any immediate changes
      fetchMembers();
    } catch (error) {
      console.error('Error sending invite:', error);
      // Show more detailed error message
      if (error.message.includes('Unauthorized') || error.message.includes('No session found')) {
        toast.error('Session expired - please sign in again');
        // Optionally trigger a sign out
      } else if (error.message.includes('Only partners can invite members')) {
        toast.error('Only partners can invite new members');
      } else {
        toast.error(error.message || 'Failed to send invitation');
      }
    } finally {
      setInviteLoading(false);
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
      case 'partner':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'associate':
        return 'bg-slate-50 text-slate-800 border-slate-200';
      default:
        return 'bg-gray-50 text-gray-800 border-gray-200';
    }
  };

  const getRoleIcon = (role) => {
    switch (role.toLowerCase()) {
      case 'partner':
        return <Shield className="h-3 w-3 mr-1" />;
      case 'associate':
        return <User className="h-3 w-3 mr-1" />;
      default:
        return null;
    }
  };

  const getRoleDisplayName = (role) => {
    switch (role.toLowerCase()) {
      case 'partner':
        return 'Partner';
      case 'associate':
        return 'Associate';
      default:
        return role;
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
    members.filter(m => m.role.toLowerCase() === 'partner').length,
  [members]);

  const associatesCount = useMemo(() => 
    members.filter(m => m.role.toLowerCase() === 'associate').length,
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

  const cancelInvite = async (inviteId) => {
    try {
      const { error } = await supabase
        .from('firm_invites')
        .update({ status: 'rejected' })
        .eq('id', inviteId);
      
      if (error) throw error;
      toast.success('Invitation cancelled');
      fetchPendingInvites();
    } catch (error) {
      console.error('Error cancelling invite:', error);
      toast.error('Failed to cancel invitation');
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
                    roleFilter === 'partner' 
                      ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium' 
                      : 'bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => setRoleFilter('partner')}
                >
                  <Shield className="h-3 w-3 mr-1.5" />
                  Partners
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`rounded-full text-xs py-1 px-3 flex items-center ${
                    roleFilter === 'associate' 
                      ? 'bg-slate-100 border-slate-300 text-slate-800 font-medium' 
                      : 'bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => setRoleFilter('associate')}
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
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={inviteRole === 'associate' ? 'default' : 'outline'}
                      className={`flex-1 ${inviteRole === 'associate' ? 'bg-slate-800 hover:bg-slate-700' : ''}`}
                      onClick={() => setInviteRole('associate')}
                      disabled={inviteLoading}
                    >
                      <User className="h-4 w-4 mr-2" />
                      Associate
                    </Button>
                    <Button
                      type="button"
                      variant={inviteRole === 'partner' ? 'default' : 'outline'}
                      className={`flex-1 ${inviteRole === 'partner' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                      onClick={() => setInviteRole('partner')}
                      disabled={inviteLoading}
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      Partner
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsInviteDialogOpen(false);
                    setInviteRole('associate');
                  }}
                  disabled={inviteLoading}
                >
                  Cancel
                </Button>
                <Button 
                  className={inviteRole === 'partner' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-800 hover:bg-slate-700'} 
                  onClick={handleInvite}
                  disabled={inviteLoading}
                >
                  {inviteLoading ? (
                    <>
                      <span className="animate-spin mr-2">⟳</span>
                      Sending...
                    </>
                  ) : (
                    'Send Invitation'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Pending Invites Section */}
        {pendingInvites.length > 0 && (
          <div className="pt-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-serif font-medium text-slate-800 flex items-center">
                <Clock className="h-5 w-5 mr-2 text-amber-500" />
                Pending Invites
              </h2>
              <span className="text-sm text-slate-500">
                {pendingInvites.length} pending {pendingInvites.length === 1 ? 'invite' : 'invites'}
              </span>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {pendingInvites.map((invite, index) => (
                <motion.div
                  key={invite.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="group relative bg-white rounded-lg border border-amber-200 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start space-x-4 min-w-0">
                        <Avatar className="h-12 w-12 border-2 border-amber-200 shrink-0">
                          <AvatarFallback className="bg-amber-50 text-amber-800 font-serif">
                            <MailIcon className="h-5 w-5" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-serif font-medium text-slate-800 truncate">
                              {invite.email}
                            </h3>
                            <Badge variant="outline" className={`rounded-sm text-xs h-5 flex items-center shrink-0 ${
                              invite.role === 'partner' 
                                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                : 'bg-slate-50 text-slate-800 border-slate-200'
                            }`}>
                              {invite.role === 'partner' ? (
                                <Shield className="h-3 w-3 mr-1" />
                              ) : (
                                <User className="h-3 w-3 mr-1" />
                              )}
                              {invite.role === 'partner' ? 'Partner' : 'Associate'}
                            </Badge>
                          </div>
                          <p className="text-slate-500 text-sm mt-1 truncate">
                            Invited by {invite.inviter?.full_name || invite.inviter?.email || 'Unknown'}
                          </p>
                        </div>
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-slate-700 shrink-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem 
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            onClick={() => cancelInvite(invite.id)}
                          >
                            <UserX className="h-4 w-4 mr-2" />
                            Cancel Invite
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center text-amber-600 text-xs font-medium">
                        <Clock className="h-3 w-3 mr-1.5" />
                        Sent {new Date(invite.created_at).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric',
                          hour: 'numeric',
                          minute: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Members Grid */}
        <div className="pt-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-serif font-medium text-slate-800 flex items-center">
              <UserCheck className="h-5 w-5 mr-2 text-slate-500" />
              Members
            </h2>
            <span className="text-sm text-slate-500">
              {filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'}
            </span>
          </div>
          {filteredMembers.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredMembers.map((member, index) => (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`group relative bg-white rounded-lg border hover:border-slate-300 transition-all duration-200 ${
                    member.role === 'partner' 
                      ? 'border-amber-200 shadow-sm hover:shadow-md' 
                      : 'border-slate-200 hover:shadow-sm'
                  }`}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start space-x-4 min-w-0">
                        <Avatar className={`h-12 w-12 shrink-0 ${
                          member.role === 'partner'
                            ? 'border-2 border-amber-200'
                            : 'border border-slate-200'
                        }`}>
                          <AvatarImage src={member.profiles?.avatar_url} />
                          <AvatarFallback className={`${
                            member.role === 'partner'
                              ? 'bg-amber-800 text-white'
                              : 'bg-slate-700 text-white'
                          } font-serif`}>
                            {getFirstLetter(member.profiles?.full_name, member.profiles?.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-serif font-medium text-slate-800 truncate">
                              {getDisplayName(member.profiles)}
                            </h3>
                            <Badge variant="outline" className={`rounded-sm text-xs h-5 flex items-center shrink-0 ${getRoleBadgeColor(member.role)}`}>
                              {getRoleIcon(member.role)}
                              {getRoleDisplayName(member.role)}
                            </Badge>
                          </div>
                          <p className="text-slate-500 text-sm mt-1 truncate">
                            {member.profiles?.email}
                          </p>
                        </div>
                      </div>
                      
                      {user?.id !== member.profile_id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-400 hover:text-slate-700 shrink-0"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {member.role !== 'partner' && (
                              <DropdownMenuItem onClick={() => changeRole(member.id, 'partner')}>
                                <Shield className="h-4 w-4 mr-2" />
                                Make Partner
                              </DropdownMenuItem>
                            )}
                            {member.role !== 'associate' && (
                              <DropdownMenuItem onClick={() => changeRole(member.id, 'associate')}>
                                <User className="h-4 w-4 mr-2" />
                                Make Associate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              className="text-red-600 focus:text-red-600 focus:bg-red-50"
                              onClick={() => removeUser(member.id)}
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center text-slate-400 text-xs font-medium">
                        <UserCheck className="h-3 w-3 mr-1.5" />
                        Member since {new Date(member.created_at).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                    </div>
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

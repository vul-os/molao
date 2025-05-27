import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, 
  Mail, 
  User, 
  Shield, 
  Calendar, 
  Check, 
  X, 
  Loader2,
  Clock,
  UserCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function InviteDialog({ open, onOpenChange }) {
  const { pendingInvites, acceptInvite, rejectInvite } = useAuth();
  const { toast } = useToast();
  const [processingInvites, setProcessingInvites] = useState(new Set());

  const handleAcceptInvite = async (inviteId) => {
    setProcessingInvites(prev => new Set(prev).add(inviteId));
    
    try {
      const result = await acceptInvite(inviteId);
      
      if (result.success) {
        toast({
          title: "Invitation accepted",
          description: "You've successfully joined the firm!",
          variant: "default"
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: "Failed to accept invitation",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setProcessingInvites(prev => {
        const newSet = new Set(prev);
        newSet.delete(inviteId);
        return newSet;
      });
    }
  };

  const handleRejectInvite = async (inviteId) => {
    setProcessingInvites(prev => new Set(prev).add(inviteId));
    
    try {
      const result = await rejectInvite(inviteId);
      
      if (result.success) {
        toast({
          title: "Invitation declined",
          description: "The invitation has been declined",
          variant: "default"
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: "Failed to decline invitation",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setProcessingInvites(prev => {
        const newSet = new Set(prev);
        newSet.delete(inviteId);
        return newSet;
      });
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });
  };

  const getRoleBadgeColor = (role) => {
    switch (role.toLowerCase()) {
      case 'partner':
        return 'bg-red-50 text-red-800 border-red-200';
      case 'associate':
        return 'bg-slate-50 text-slate-800 border-slate-200';
      default:
        return 'bg-slate-50 text-slate-800 border-slate-200';
    }
  };

  const getRoleIcon = (role) => {
    switch (role.toLowerCase()) {
      case 'partner':
        return <Shield className="h-3 w-3 mr-1" />;
      case 'associate':
        return <User className="h-3 w-3 mr-1" />;
      default:
        return <User className="h-3 w-3 mr-1" />;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[95vh] overflow-hidden flex flex-col p-0 sm:p-6">
        <DialogHeader className="space-y-3 pb-4 px-4 pt-6 sm:px-0 sm:pt-0">
          <DialogTitle className="text-lg sm:text-xl lg:text-2xl font-serif font-medium text-slate-800 flex items-center gap-3">
            <div className="flex-shrink-0 bg-red-50 p-2 sm:p-2.5 rounded-lg border border-red-200">
              <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-red-700" />
            </div>
            <span className="truncate">Firm Invitations</span>
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-sm sm:text-base">
            You have {pendingInvites?.length || 0} pending invitation{pendingInvites?.length !== 1 ? 's' : ''} to join law firms.
          </DialogDescription>
        </DialogHeader>

        <Separator className="mx-4 sm:mx-0" />

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-0 sm:py-0 sm:mt-4">
          <div className="space-y-4 sm:space-y-6">
            {pendingInvites?.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-8 sm:py-12 lg:py-16 bg-slate-50 border border-slate-200 rounded-lg"
              >
                <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                  <Mail className="h-6 w-6 sm:h-8 sm:w-8 text-slate-400" />
                </div>
                <h3 className="text-base sm:text-lg font-serif font-medium text-slate-800 mb-2">No pending invitations</h3>
                <p className="text-slate-500 max-w-sm mx-auto text-sm sm:text-base px-4">
                  You're all caught up! When firms invite you to join, they'll appear here for your review.
                </p>
              </motion.div>
            ) : (
              <>
                <div className="space-y-4 sm:space-y-6">
                  {pendingInvites?.map((invite, index) => {
                    const isProcessing = processingInvites.has(invite.invite_id);
                    const isPartner = invite.role.toLowerCase() === 'partner';
                    
                    return (
                      <motion.div
                        key={invite.invite_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        className={cn(
                          "group relative bg-white rounded-lg border transition-all duration-200 hover:shadow-lg",
                          isPartner 
                            ? 'border-red-200 shadow-sm ring-1 ring-red-100' 
                            : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                        )}
                      >
                        <CardContent className="p-4 sm:p-6 lg:p-8">
                          <div className="space-y-4 sm:space-y-6">
                            {/* Header Section */}
                            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                              <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
                                <div className={cn(
                                  "flex-shrink-0 p-2 sm:p-3 rounded-lg border",
                                  isPartner
                                    ? 'bg-red-50 border-red-200'
                                    : 'bg-slate-50 border-slate-200'
                                )}>
                                  <Building2 className={cn(
                                    "h-5 w-5 sm:h-6 sm:w-6",
                                    isPartner ? 'text-red-700' : 'text-slate-600'
                                  )} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:items-center sm:gap-3">
                                    <h3 className="font-serif font-medium text-lg sm:text-xl text-slate-800 truncate">
                                      {invite.firm_name}
                                    </h3>
                                    <Badge 
                                      variant="outline" 
                                      className={cn(
                                        "rounded-full h-6 flex items-center shrink-0 w-fit text-xs sm:text-sm",
                                        getRoleBadgeColor(invite.role)
                                      )}
                                    >
                                      {getRoleIcon(invite.role)}
                                      {getRoleDisplayName(invite.role)}
                                    </Badge>
                                  </div>
                                  <p className="text-slate-500 mt-1 text-sm sm:text-base">
                                    Invitation to join as {getRoleDisplayName(invite.role)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <Separator />

                            {/* Details Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                              <div className="space-y-2 sm:space-y-3">
                                <div className="flex items-center gap-2 sm:gap-3 text-slate-600">
                                  <User className="h-4 w-4 flex-shrink-0" />
                                  <span className="font-medium text-sm sm:text-base">Invited by</span>
                                </div>
                                <p className="font-serif font-medium text-slate-800 ml-6 sm:ml-7 text-sm sm:text-base break-words">
                                  {invite.invited_by_name || invite.invited_by_email}
                                </p>
                              </div>
                              <div className="space-y-2 sm:space-y-3">
                                <div className="flex items-center gap-2 sm:gap-3 text-slate-600">
                                  <Calendar className="h-4 w-4 flex-shrink-0" />
                                  <span className="font-medium text-sm sm:text-base">Invited on</span>
                                </div>
                                <p className="font-serif font-medium text-slate-800 ml-6 sm:ml-7 text-sm sm:text-base">
                                  {formatDate(invite.created_at)}
                                </p>
                              </div>
                            </div>

                            <Separator />

                            {/* Actions Section */}
                            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 pt-2">
                              <Button
                                onClick={() => handleAcceptInvite(invite.invite_id)}
                                disabled={isProcessing}
                                className={cn(
                                  "flex-1 text-white h-11 sm:h-12 text-sm sm:text-base font-medium shadow-sm transition-all",
                                  isPartner
                                    ? 'bg-red-800 hover:bg-red-900 focus:ring-red-500'
                                    : 'bg-red-700 hover:bg-red-800 focus:ring-red-500'
                                )}
                              >
                                {isProcessing ? (
                                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                                )}
                                <span className="truncate">Accept Invitation</span>
                              </Button>
                              <Button
                                onClick={() => handleRejectInvite(invite.invite_id)}
                                disabled={isProcessing}
                                variant="outline"
                                className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400 focus:ring-slate-500 h-11 sm:h-12 text-sm sm:text-base font-medium transition-all"
                              >
                                {isProcessing ? (
                                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 animate-spin" />
                                ) : (
                                  <X className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                                )}
                                <span className="truncate">Decline</span>
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </motion.div>
                    );
                  })}
                </div>

                {/* About Membership - Inside Scrollable Area */}
                <div className="mt-4 sm:mt-6 mb-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-4">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-slate-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-slate-700 mb-1">
                          About firm membership
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Once you accept an invitation, you'll be able to use the firm's quota for searches when it is selected in the top right corner.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 
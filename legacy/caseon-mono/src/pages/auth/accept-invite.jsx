import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/services/supabase-client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from '@/hooks/use-toast';

const AcceptInvite = () => {
  const { user, setHasLoadedHosts } = useAuth();
  const { token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [inviteData, setInviteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchInviteData = async () => {
      if (!token) {
        setError('Invalid invitation link. Please request a new invitation.');
        setLoading(false);
        return;
      }

      if (!user) {
        setLoading(false);
        return;
      }
  
      try {
        const { data, error } = await supabase
          .rpc('get_invite_data', { 
            p_token: token 
          });

        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('This invitation has expired or is invalid.');
          }
          throw error;
        }
        
        if (!data) {
          throw new Error('Invalid invitation. Please request a new one.');
        }

        setInviteData(data);
      } catch (error) {
        console.error('Error fetching invite:', error);
        setError(error.message);
        
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
  
    fetchInviteData();
  }, [token, user, toast]);

  const handleAcceptInvite = async () => {
    setAccepting(true);
    setError('');
    
    try {
      const { data, error } = await supabase.rpc(
        'accept_host_invitation',
        { p_token: token }
      );

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('This invitation has expired or is no longer valid.');
        }
        throw error;
      }
      
      if (!Array.isArray(data) || !data[0]?.host_id) {
        throw new Error('Failed to process invitation. Please try again.');
      }

      // Set success state
      setSuccess(true);
      
      // Trigger hosts refresh
      setHasLoadedHosts(false);
      
      toast({
        title: "Success!",
        description: "You've successfully joined the host.",
        duration: 3000,
      });

      // Navigate after a short delay to show success state
      setTimeout(() => {
        navigate('/');
      }, 2000);
      
    } catch (error) {
      console.error('Error accepting invite:', error);
      setError(error.message);
      
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      
      setAccepting(false);
    }
  };

  // Show sign in prompt if no user
  if (!user) {
    return (
      <div className="container mx-auto max-w-md mt-10 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Host Invitation</CardTitle>
            <CardDescription>
              Sign in to accept your invitation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please sign in or create an account to accept this invitation.
              </AlertDescription>
            </Alert>
            <div className="flex flex-col gap-2">
              <Button 
                className="w-full" 
                onClick={() => navigate('/signin', { 
                  state: { redirectTo: `/invite/${token}` } 
                })}
              >
                Sign In
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate('/signup', { 
                  state: { redirectTo: `/invite/${token}` } 
                })}
              >
                Create Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading invitation details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-md mt-10 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Accept Invitation</CardTitle>
          {inviteData?.host && (
            <CardDescription>
              Join {inviteData.host.name}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : success ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>
                You've successfully joined {inviteData?.host?.name}.
                Redirecting to dashboard...
              </AlertDescription>
            </Alert>
          ) : inviteData?.host ? (
            <>
              <Alert>
                <AlertDescription>
                  You've been invited to join <strong>{inviteData.host.name}</strong> as 
                  a <strong>{inviteData.role.toLowerCase()}</strong>.
                </AlertDescription>
              </Alert>

              <Button 
                className="w-full"
                onClick={handleAcceptInvite}
                disabled={accepting}
              >
                {accepting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Accepting Invitation...
                  </>
                ) : (
                  'Accept Invitation'
                )}
              </Button>
            </>
          ) : null}
          
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => navigate('/')}
            disabled={accepting}
          >
            {error ? 'Return to Dashboard' : 'Cancel'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvite;
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/services/supabase-client';
import { Button } from "@/components/ui/button";
import { Layout } from '@/components/layout/auth-layout';
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from '@/hooks/use-toast';

const AcceptInvite = () => {
  const { user, setHasLoadedFirms } = useAuth();
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
        'accept_firm_invitation',
        { p_token: token }
      );

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('This invitation has expired or is no longer valid.');
        }
        throw error;
      }
      
      if (!Array.isArray(data) || !data[0]?.firm_id) {
        throw new Error('Failed to process invitation. Please try again.');
      }

      setSuccess(true);
      setHasLoadedFirms(false);
      
      toast({
        title: "Success!",
        description: "You've successfully joined the firm.",
        duration: 3000,
      });

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

  if (!user) {
    return (
      <Layout>
        <div className="flex min-h-screen bg-white">
          <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 lg:px-16 xl:px-24">
            <div className="max-w-md w-full mx-auto space-y-8">
              {/* Logo */}
              <div className="flex justify-center mb-8">
                <img
                  src="/api/placeholder/120/40"
                  alt="Nuamic"
                  className="h-10"
                />
              </div>

              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                    Firm Invitation
                  </h1>
                  <p className="mt-2 text-sm text-gray-600">
                    Sign in to accept your invitation
                  </p>
                </div>

                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Please sign in or create an account to accept this invitation.
                  </p>
                </div>

                <div className="space-y-4">
                  <Button 
                    className="w-full h-12 bg-black text-white hover:bg-gray-900 rounded-lg transition-colors"
                    onClick={() => navigate('/signin', { 
                      state: { redirectTo: `/invite/${token}` } 
                    })}
                  >
                    Sign In
                  </Button>

                  <Button 
                    variant="outline"
                    className="w-full h-12 hover:bg-gray-50"
                    onClick={() => navigate('/signup', { 
                      state: { redirectTo: `/invite/${token}` } 
                    })}
                  >
                    Create Account
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Content */}
          <div className="hidden lg:block lg:w-1/2 bg-gray-50">
            <div className="h-full flex items-center justify-center p-8">
              <div className="max-w-md text-center">
                <h2 className="text-3xl font-semibold text-gray-900 mb-4">
                  Join Your Legal Team
                </h2>
                <p className="text-gray-600">
                  Connect with your firm and start collaborating with your colleagues on Nuamic.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-screen bg-white">
          <div className="w-full flex flex-col justify-center items-center px-8">
            <div className="space-y-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-black mx-auto" />
              <p className="text-gray-600">Loading invitation details...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex min-h-screen bg-white">
        <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 lg:px-16 xl:px-24">
          <div className="max-w-md w-full mx-auto space-y-8">
            {/* Logo */}
            <div className="flex justify-center mb-8">
              <img
                src="/api/placeholder/120/40"
                alt="Nuamic"
                className="h-10"
              />
            </div>

            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                  {success ? 'Invitation Accepted' : 'Accept Invitation'}
                </h1>
                {inviteData?.firm && (
                  <p className="mt-2 text-sm text-gray-600">
                    {success 
                      ? `You've successfully joined ${inviteData.firm.name}`
                      : `Join ${inviteData.firm.name} as ${inviteData.role.toLowerCase()}`
                    }
                  </p>
                )}
              </div>

              {error ? (
                <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-5 w-5" />
                    <p>{error}</p>
                  </div>
                </div>
              ) : success ? (
                <div className="p-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <p>Redirecting to dashboard...</p>
                  </div>
                </div>
              ) : inviteData?.firm ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-600">
                      You've been invited to join <span className="font-medium">{inviteData.firm.name}</span> as 
                      a <span className="font-medium">{inviteData.role.toLowerCase()}</span>.
                    </p>
                  </div>

                  <Button 
                    className="w-full h-12 bg-black text-white hover:bg-gray-900 rounded-lg transition-colors"
                    onClick={handleAcceptInvite}
                    disabled={accepting}
                  >
                    {accepting ? (
                      <div className="flex items-center justify-center">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Accepting Invitation...
                      </div>
                    ) : (
                      'Accept Invitation'
                    )}
                  </Button>

                  <Button 
                    variant="outline"
                    className="w-full h-12 hover:bg-gray-50"
                    onClick={() => navigate('/')}
                    disabled={accepting}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right Side - Content */}
        <div className="hidden lg:block lg:w-1/2 bg-gray-50">
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <h2 className="text-3xl font-semibold text-gray-900 mb-4">
                Join Your Legal Team
              </h2>
              <p className="text-gray-600">
                Connect with your firm and start collaborating with your colleagues on Nuamic.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AcceptInvite;
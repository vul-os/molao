import React, { useState } from 'react';
import { Layout } from '@/components/layout/auth-layout';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      // Here you would typically make an API call to handle password reset
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      setIsSubmitted(true);
    } catch (error) {
      setError('Failed to send reset link. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex min-h-screen bg-white">
        {/* Left Side - Form */}
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

            {!isSubmitted ? (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                    Reset your password
                  </h1>
                  <p className="mt-2 text-sm text-gray-600">
                    Enter your email address and we'll send you instructions to reset your password.
                  </p>
                </div>

                {error && (
                  <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-1">
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError('');
                        }}
                        disabled={isLoading}
                        className="pl-10 h-12 w-full border border-gray-200"
                        placeholder="Enter your email address"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Button 
                      type="submit" 
                      className="w-full h-12 bg-black text-white hover:bg-gray-900 rounded-lg transition-colors"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Sending...' : 'Send Reset Link'}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-12 hover:bg-gray-50"
                      onClick={() => navigate('/signin')}
                      disabled={isLoading}
                    >
                      Back to Sign In
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                    Check your email
                  </h1>
                  <p className="mt-2 text-sm text-gray-600">
                    We've sent password reset instructions to <span className="font-medium">{email}</span>.
                    The link will expire in 1 hour.
                  </p>
                </div>

                <div className="space-y-4">
                  <Button 
                    className="w-full h-12 bg-black text-white hover:bg-gray-900 rounded-lg transition-colors"
                    onClick={() => setIsSubmitted(false)}
                  >
                    Try Different Email
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full h-12 hover:bg-gray-50"
                    onClick={() => navigate('/signin')}
                  >
                    Back to Sign In
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Content */}
        <div className="hidden lg:block lg:w-1/2 bg-gray-50">
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <h2 className="text-3xl font-semibold text-gray-900 mb-4">
                Account Recovery
              </h2>
              <p className="text-gray-600">
                We prioritize the security of your legal practice. Follow the instructions sent to your email to safely recover your account.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ForgotPasswordPage;
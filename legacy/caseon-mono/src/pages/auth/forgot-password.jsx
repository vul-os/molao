import React, { useState } from 'react';
import { Layout } from '@/components/layout/auth-layout';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = (e) => {
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

    // Here you would typically make an API call to handle password reset
    console.log('Password reset requested for:', email);
    setIsSubmitted(true);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1">
        {/* Left Side - Reset Form */}
        <div className="w-full lg:w-1/2 p-8 flex items-start justify-center">
          <div className="w-full max-w-md space-y-6">
            <Button 
              variant="ghost" 
              className="flex items-center text-blue-600 hover:text-blue-700"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {!isSubmitted ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight">Reset Password</h2>
                  <p className="text-gray-500">
                    Please enter your email to receive a link to reset your password.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                      <Input
                        type="email"
                        placeholder="Email"
                        className={`pl-10 ${error ? "border-red-500 focus:ring-red-500" : ""}`}
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError('');
                        }}
                      />
                    </div>
                    {error && (
                      <p className="text-sm text-red-500">{error}</p>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Send Reset Link
                  </Button>
                </form>

                <div className="text-center text-sm">
                  <span className="text-gray-600">
                    Remember your password?{' '}
                  </span>
                  <Button
                    variant="link"
                    className="text-blue-600 p-0"
                    onClick={() => navigate('/login')}
                  >
                    Sign in
                  </Button>
                </div>
              </div>
            ) : (
              <Card className="p-6 space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight">Check your email</h2>
                  <p className="text-gray-500">
                    We've sent a password reset link to <span className="font-medium">{email}</span>. 
                    The link will expire in 1 hour.
                  </p>
                </div>
                
                <div className="space-y-3">
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => setIsSubmitted(false)}
                  >
                    Try another email
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate('/login')}
                  >
                    Back to sign in
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Right Side - Image */}
        <div className="hidden lg:block lg:w-1/2 relative">
          <picture>
            <source
              media="(min-width: 1024px)"
              srcSet="https://d9lvjui2ux1xa.cloudfront.net/img/auth/auth-image_2000x.webp"
            />
            <source
              srcSet="https://d9lvjui2ux1xa.cloudfront.net/img/auth/auth-image_1500x.webp"
            />
            <source
              media="(min-width: 1024px)"
              srcSet="https://d9lvjui2ux1xa.cloudfront.net/img/auth/auth-image-2000x.jpg"
            />
            <source
              srcSet="https://d9lvjui2ux1xa.cloudfront.net/img/auth/auth-image-1500x.jpg"
            />
            <img
              src="https://d9lvjui2ux1xa.cloudfront.net/img/auth/auth-image-2000x.jpg"
              alt="Beautiful Neighborhood"
              className="object-cover w-full h-full"
            />
          </picture>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
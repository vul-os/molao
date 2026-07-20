import React, { useState } from 'react';
import { Layout } from '@/components/layout/auth-layout';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from '@/context/auth-context';
import { Mail, Eye, EyeOff, Lock } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";

const SignInPage = () => {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const validateForm = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      setIsLoading(true);
      try {
        await signIn(formData.email, formData.password);
        navigate('/');
      } catch (error) {
        if (error.code === 'email_not_confirmed') {
          setErrors(prev => ({
            ...prev,
            emailConfirmation: true
          }));
        } else {
          setErrors(prev => ({
            ...prev,
            submit: error.message
          }));
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleForgotPassword = (e) => {
    e.preventDefault(); // Prevent form submission
    navigate('/forgot-password');
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
                src="/icon.svg"
                alt="Nuamic"
                className="h-12"
              />
            </div>

            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                  Welcome to Nuamic
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                  Please sign in to continue
                </p>
              </div>

              {errors.emailConfirmation && (
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertDescription className="text-blue-800">
                    Please check your email to confirm your account. We've sent you a confirmation link. 
                    Don't see it? Please check your spam folder or <Button
                      variant="link"
                      className="text-blue-800 font-medium p-0 h-auto"
                      onClick={() => {/* Add resend confirmation email logic */}}
                    >
                      click here to resend
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {errors.submit && !errors.emailConfirmation && (
                <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
                  {errors.submit}
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
                      name="email"
                      type="email"
                      autoComplete="email"
                      className={`pl-10 h-12 w-full border ${errors.email ? "border-red-500" : "border-gray-200"} rounded-lg`}
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      disabled={isLoading}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-red-600 mt-1">{errors.email}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                      Password
                    </Label>
                    <Button
                      type="button" // Changed to type="button"
                      variant="link"
                      className="text-sm text-gray-600 hover:text-gray-900"
                      onClick={handleForgotPassword}
                      disabled={isLoading}
                    >
                      Forgot password?
                    </Button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className={`pl-10 h-12 w-full border ${errors.password ? "border-red-500" : "border-gray-200"} rounded-lg`}
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-red-600 mt-1">{errors.password}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-black text-white hover:bg-gray-900 rounded-lg transition-colors"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>

              <div className="text-center">
                <p className="text-sm text-gray-600">
                  Don't have an account?{' '}
                  <Button
                    type="button" // Added type="button"
                    variant="link"
                    className="text-black hover:text-gray-900 font-medium"
                    onClick={() => navigate('/signup')}
                    disabled={isLoading}
                  >
                    Create account
                  </Button>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Decorative */}
        <div className="hidden lg:block lg:w-1/2 bg-gray-50">
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <h2 className="text-3xl font-semibold text-gray-900 mb-4">
                Streamline Your Legal Practice
              </h2>
              <p className="text-gray-600">
                Nuamic provides powerful tools to help legal professionals work more efficiently and effectively.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SignInPage;
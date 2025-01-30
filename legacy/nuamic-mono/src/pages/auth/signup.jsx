import React, { useState } from 'react';
import { Layout } from '@/components/layout/auth-layout';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from '@/context/auth-context';
import { Mail, Eye, EyeOff, Lock } from 'lucide-react';

const SignUpPage = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    agreeToTerms: false
  });

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(formData.password)) {
      newErrors.password = 'Password must be at least 8 characters with 1 number and 1 uppercase letter';
    }
    
    if (!formData.agreeToTerms) {
      newErrors.agreeToTerms = 'You must accept the terms and conditions';
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
        await signUp(formData.email, formData.password);
        navigate('/verify-email');
      } catch (error) {
        setErrors(prev => ({
          ...prev,
          submit: error.message
        }));
      } finally {
        setIsLoading(false);
      }
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
                src="/icon.svg"
                alt="Nuamic"
                className="h-12"
              />
            </div>

            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                  Create your Nuamic account
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                  Join thousands of legal professionals using Nuamic
                </p>
              </div>

              {errors.submit && (
                <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
                  {errors.submit}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="firstName" className="text-sm font-medium text-gray-700">
                      First Name
                    </Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      required
                      className={`h-12 ${errors.firstName ? "border-red-500" : "border-gray-200"}`}
                      disabled={isLoading}
                    />
                    {errors.firstName && (
                      <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lastName" className="text-sm font-medium text-gray-700">
                      Last Name
                    </Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      required
                      className={`h-12 ${errors.lastName ? "border-red-500" : "border-gray-200"}`}
                      disabled={isLoading}
                    />
                    {errors.lastName && (
                      <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                    Work Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      className={`pl-10 h-12 ${errors.email ? "border-red-500" : "border-gray-200"}`}
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
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      className={`pl-10 h-12 ${errors.password ? "border-red-500" : "border-gray-200"}`}
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

                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Checkbox 
                      id="terms" 
                      checked={formData.agreeToTerms}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, agreeToTerms: checked }))
                      }
                      className={errors.agreeToTerms ? "border-red-500" : ""}
                      disabled={isLoading}
                    />
                    <label
                      htmlFor="terms"
                      className="text-sm text-gray-600"
                    >
                      I agree to Nuamic's{' '}
                      <a href="/terms" className="text-black hover:underline font-medium">
                        Terms of Service
                      </a>
                      {' '}and{' '}
                      <a href="/privacy" className="text-black hover:underline font-medium">
                        Privacy Policy
                      </a>
                    </label>
                  </div>
                  {errors.agreeToTerms && (
                    <p className="text-sm text-red-600">{errors.agreeToTerms}</p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-black text-white hover:bg-gray-900 rounded-lg transition-colors"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating Account...' : 'Create Account'}
                </Button>

                <div className="text-center">
                  <p className="text-sm text-gray-600">
                    Already have an account?{' '}
                    <Button
                      variant="link"
                      className="text-black hover:text-gray-900 font-medium p-0"
                      onClick={() => navigate('/login')}
                      disabled={isLoading}
                    >
                      Sign in
                    </Button>
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right Side - Content */}
        <div className="hidden lg:block lg:w-1/2 bg-gray-50">
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <h2 className="text-3xl font-semibold text-gray-900 mb-4">
                Transform Your Legal Practice
              </h2>
              <p className="text-gray-600">
                Join thousands of legal professionals who trust Nuamic to streamline their workflow and enhance their practice efficiency.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SignUpPage;
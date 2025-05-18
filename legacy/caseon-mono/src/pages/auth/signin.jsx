import React, { useState } from 'react';
import { Layout } from '@/components/layout/auth-layout';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from '@/context/auth-context';
import { 
  Mail, 
  Eye,
  EyeOff,
  Lock,
  Phone
} from 'lucide-react';

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
        setErrors(prev => ({
          ...prev,
          submit: error.message
        }));
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
      // The redirect will be handled by the OAuth provider
    } catch (error) {
      setErrors(prev => ({
        ...prev,
        submit: error.message
      }));
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 bg-white">
          <div className="mx-auto w-full max-w-sm lg:w-96">
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
                  Welcome back
                </h2>
                <p className="mt-3 text-sm text-gray-500">
                  Sign in to your account to continue
                </p>
              </div>

              {errors.submit && (
                <div className="p-4 text-sm font-medium text-red-800 bg-red-50 rounded-lg border border-red-200 shadow-sm">
                  {errors.submit}
                </div>
              )}

              <div className="space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full flex items-center justify-center gap-3 h-11 hover:bg-gray-50 transition-colors duration-200 shadow-sm border-gray-300"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                >
                 <img 
                    src="data:image/png;base64,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" 
                    alt="Google" 
                    className="w-5"
                  />
                  <span className="font-medium">Log in with Google</span>
                </Button>

                <Button 
                  variant="outline"
                  className="w-full flex items-center justify-center gap-3 h-11 hover:bg-gray-50 transition-colors duration-200 shadow-sm border-gray-300"
                  disabled={isLoading}
                >
                  <Phone className="w-5 h-5 text-gray-600" />
                  <span className="font-medium">Continue with phone number</span>
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500 font-medium">or</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-700 font-medium">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors duration-200" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      className={`pl-10 h-11 bg-gray-50 border ${errors.email ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-blue-500"} rounded-md focus:border-blue-500 transition-all duration-200`}
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      disabled={isLoading}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-red-500 font-medium">{errors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-gray-700 font-medium">Password</Label>
                    <Button 
                      variant="link" 
                      className="text-sm text-blue-600 p-0 font-medium"
                      onClick={() => navigate('/forgot-password')}
                      disabled={isLoading}
                    >
                      Forgot password?
                    </Button>
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors duration-200" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className={`pl-10 h-11 bg-gray-50 border ${errors.password ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-blue-500"} rounded-md focus:border-blue-500 transition-all duration-200`}
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-500 focus:outline-none"
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
                    <p className="text-sm text-red-500 font-medium">{errors.password}</p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors duration-200 shadow-md"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>

              <div className="text-center pt-2">
                <span className="text-sm text-gray-600">Don't have an account?{' '}</span>
                <Button
                  variant="link"
                  className="text-blue-600 p-0 font-medium"
                  onClick={() => navigate('/signup')}
                  disabled={isLoading}
                >
                  Sign up
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Image */}         
        <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">           
          <picture>             
            <source               
              media="(min-width: 1024px)"               
              srcSet="https://d9lvjui2ux1xa.cloudfront.net/img/auth/auth-image_2000x.webp"             
            />             
            <source               
              media="(min-width: 640px)"               
              srcSet="https://d9lvjui2ux1xa.cloudfront.net/img/auth/auth-image_2000x.webp"             
            />             
            <img               
              src="https://d9lvjui2ux1xa.cloudfront.net/img/auth/auth-image_2000x.webp"               
              alt="Beautiful Neighborhood"               
              className="object-cover w-full h-full transition-transform duration-10000 hover:scale-110"             
            />           
          </picture>         
        </div>
      </div>
    </Layout>
  );
};

export default SignInPage;
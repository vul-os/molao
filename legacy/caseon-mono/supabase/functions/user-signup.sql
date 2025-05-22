-- Enable the pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to handle new profile creation and send welcome email
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
    user_email text;
    signup_url text;
BEGIN
    -- Get the email from auth.users table using the new profile's id
    SELECT email INTO user_email 
    FROM auth.users 
    WHERE id = NEW.id;
    
    -- Set the edge function URL
    signup_url := 'https://gxwpvpqatisvkpgpstst.supabase.co/functions/v1/user-signup';
    
    -- Only proceed if we have an email
    IF user_email IS NOT NULL THEN
        -- Send the HTTP request immediately
        PERFORM net.http_post(
            signup_url,
            jsonb_build_object(
                'email', user_email
            ),
            '{}'::jsonb, -- No URL params
            '{"Content-Type": "application/json"}'::jsonb,
            30000 -- 30 second timeout
        );
        
        RAISE NOTICE 'User signup notification sent for %', user_email;
    ELSE
        RAISE NOTICE 'Could not find email for user ID %', NEW.id;
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in handle_new_user_signup: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user_signup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_signup() TO service_role;

-- Create the trigger
DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_signup();

-- Revoke REST API access
REVOKE ALL ON FUNCTION public.handle_new_user_signup() FROM anon, authenticated; 
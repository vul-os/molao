-- First, recreate tables exactly matching the structure
DROP TABLE IF EXISTS firm_members CASCADE;
DROP TABLE IF EXISTS firms CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS firm_invites CASCADE;

-- Create profiles table EXACTLY as in original
CREATE TABLE profiles (
    id uuid references auth.users on delete cascade not null primary key,
    updated_at timestamp with time zone,
    username text unique,
    full_name text,
    email text unique,
    avatar_url text,
    website text,
    constraint username_length check (char_length(username) >= 3)
);

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Create firms table to match organizations
CREATE TABLE firms (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create firm_members to match organization_members
CREATE TABLE firm_members (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    firm_id uuid REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
    profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    role text NOT NULL,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(firm_id, profile_id)
);



-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create function EXACTLY matching the original structure
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
   new_profile_id uuid;
   firm_id uuid;
   invite_exists boolean;
BEGIN
   -- Create profile and get its ID
   INSERT INTO public.profiles (id, full_name, email, avatar_url)
   VALUES (
       new.id, 
       new.raw_user_meta_data->>'full_name', 
       new.email,
       new.raw_user_meta_data->>'avatar_url'
   )
   RETURNING id INTO new_profile_id;

   -- Set invite_exists to false (exactly as original)
   select false into invite_exists;
   
   IF NOT invite_exists THEN
       -- Create new firm (matching organization creation)
       INSERT INTO public.firms (name)
       VALUES (
           concat(
               initcap(split_part(new.email, '@', 1)),
               '''s Firm'
           )
       )
       RETURNING id INTO firm_id;

       -- Add user as admin (matching original)
       INSERT INTO public.firm_members (
           firm_id,
           profile_id,
           role
       )
       VALUES (
           firm_id,
           new_profile_id,
           'admin'
       );
   END IF;

   RETURN new;
EXCEPTION WHEN others THEN
   raise log 'Error in handle_new_user: %', SQLERRM;
   RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger exactly as original
CREATE TRIGGER on_auth_user_created
   AFTER INSERT ON auth.users
   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create firm_invites table for storing pending invitations
CREATE TABLE firm_invites (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    firm_id uuid REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
    email text NOT NULL,
    invited_by uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(firm_id, email, status)
);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_firm_invites_updated_at
    BEFORE UPDATE ON firm_invites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
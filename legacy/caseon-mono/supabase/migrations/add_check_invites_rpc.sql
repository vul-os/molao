-- Create security definer function to check for pending invites
CREATE OR REPLACE FUNCTION public.check_invites()
RETURNS TABLE (
    invite_id uuid,
    firm_id uuid,
    firm_name text,
    invited_by_name text,
    invited_by_email text,
    role text,
    created_at timestamptz
) 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_email text;
BEGIN
    -- Get the current user's email from auth.users
    SELECT email INTO current_user_email
    FROM auth.users 
    WHERE id = auth.uid();
    
    -- If no authenticated user, return empty result
    IF current_user_email IS NULL THEN
        RETURN;
    END IF;
    
    -- Return pending invites for the current user's email
    RETURN QUERY
    SELECT 
        fi.id as invite_id,
        fi.firm_id,
        f.name as firm_name,
        p.full_name as invited_by_name,
        p.email as invited_by_email,
        fi.role,
        fi.created_at
    FROM firm_invites fi
    JOIN firms f ON fi.firm_id = f.id
    JOIN profiles p ON fi.invited_by = p.id
    WHERE fi.email = current_user_email 
      AND fi.status = 'pending'
    ORDER BY fi.created_at DESC;
    
END;
$$ LANGUAGE plpgsql;

-- Create security definer function to respond to firm invitations
CREATE OR REPLACE FUNCTION public.respond_invitation(
    p_firm_id uuid,
    p_accept boolean
)
RETURNS json
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_email text;
    current_user_id uuid;
    invite_record record;
    result json;
BEGIN
    -- Get the current user's ID and email from auth.users
    SELECT id, email INTO current_user_id, current_user_email
    FROM auth.users 
    WHERE id = auth.uid();
    
    -- If no authenticated user, return error
    IF current_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User not authenticated'
        );
    END IF;
    
    -- Find the pending invite for this user and firm
    SELECT * INTO invite_record
    FROM firm_invites 
    WHERE firm_id = p_firm_id 
      AND email = current_user_email 
      AND status = 'pending';
    
    -- If no pending invite found, return error
    IF invite_record IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No pending invitation found for this firm'
        );
    END IF;
    
    -- Update invite status based on acceptance
    IF p_accept THEN
        -- Accept invitation
        UPDATE firm_invites 
        SET status = 'accepted',
            updated_at = timezone('utc'::text, now())
        WHERE id = invite_record.id;
        
        -- Add user to firm_members
        INSERT INTO firm_members (
            firm_id,
            profile_id,
            role
        )
        VALUES (
            p_firm_id,
            current_user_id,
            invite_record.role
        );
        
        result := json_build_object(
            'success', true,
            'message', 'Invitation accepted successfully',
            'firm_id', p_firm_id,
            'role', invite_record.role
        );
    ELSE
        -- Reject invitation
        UPDATE firm_invites 
        SET status = 'rejected',
            updated_at = timezone('utc'::text, now())
        WHERE id = invite_record.id;
        
        result := json_build_object(
            'success', true,
            'message', 'Invitation rejected',
            'firm_id', p_firm_id
        );
    END IF;
    
    RETURN result;
    
EXCEPTION WHEN others THEN
    -- Handle any errors
    RETURN json_build_object(
        'success', false,
        'error', 'Database error: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql; 
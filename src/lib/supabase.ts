import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mdlseqbrwkgwrvjcrcwt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbHNlcWJyd2tnd3J2amNyY3d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTUxMDcsImV4cCI6MjA4ODMzMTEwN30.ugfAuR9q0SK-glE6ih3Bltzj28qIwFXOyaxp-_2Cag4';

export const supabase = createClient(supabaseUrl, supabaseKey);

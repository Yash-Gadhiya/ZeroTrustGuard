import { useEffect, useState } from "react";
import api from "../api/axios";
import { User, ShieldCheck, Mail, Building2, Loader2 } from "lucide-react";

interface Profile {
  email: string;
  role: string;
  department: string;
  designation: string;
  designation_level?: number; 
  level?: number;
  is_blocked: boolean;
}

export default function UserProfileCard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("ztg_token");

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get("/api/auth/profile");
        setProfile(res.data);
      } catch (err) {
        console.error("Profile fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchProfile();
  }, [token]);

  const getInitials = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'admin': return 'A';
      case 'staff': return 'S';
      case 'senior': return 'SS';
      case 'intern': return 'IN';
      default: return 'U';
    }
  };

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  if (!profile) return null;

  const displayLevel = profile.designation_level ?? profile.level ?? "N/A";
  const isAdmin = profile.role?.toLowerCase() === 'admin';

  return (
    <div className="relative group">
      <div className="w-10 h-10 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center cursor-pointer hover:bg-primary/30 hover:border-primary transition-all shadow-md">
        <span className="text-primary font-bold text-sm">
          {getInitials(profile.role)}
        </span>
      </div>

      <div className="absolute top-12 right-0 w-64 bg-card border border-border rounded-xl shadow-2xl p-0 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] transform group-hover:translate-y-1 overflow-hidden">
        <div className="p-4 bg-secondary/30 border-b border-border text-center">
          <div className="w-12 h-12 rounded-full bg-primary mx-auto mb-2 flex items-center justify-center text-primary-foreground shadow-lg">
            <User size={24} />
          </div>
          <p className="text-sm font-bold truncate text-foreground">{profile.email}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{profile.designation || 'No Designation'}</p>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 size={14} />
              <span>Dept</span>
            </div>
            <span className="font-semibold text-foreground">{profile.department || 'N/A'}</span>
          </div>
          
          {/* HIDE LEVEL FOR ADMINS */}
          {!isAdmin && (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck size={14} />
                <span>Level</span>
              </div>
              <span className="font-semibold text-foreground">{displayLevel}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail size={14} />
              <span>Role</span>
            </div>
            <span className="font-semibold capitalize text-foreground">{profile.role}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
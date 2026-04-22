import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { ChevronDown, Loader2, ShieldCheck, UserPlus, Mail, Lock, Building2, Briefcase } from "lucide-react"; 
import { useToast } from "@/hooks/use-toast";
import api from "../api/axios";

const AddUser = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(""); 
  const [department, setDepartment] = useState(""); 
  const [designation, setDesignation] = useState("");
  const [level, setLevel] = useState<number | "">(""); 
  const [loading, setLoading] = useState(false);

  // Logic: Auto-calculate Designation and Level based on Role + Dept
  const updateAutoFields = (currentRole: string, currentDept: string) => {
    // Set Level
    if (currentRole === "intern") setLevel(1);
    else if (currentRole === "staff") setLevel(2);
    else if (currentRole === "senior") setLevel(3);
    else if (currentRole === "admin") setLevel(1);
    else setLevel("");

    // Set Designation
    if (!currentRole || !currentDept) {
      setDesignation("");
      return;
    }

    const mapping: Record<string, Record<string, string>> = {
      IT: {
        intern: "IT Intern",
        staff: "Junior Engineer",
        senior: "Senior Systems Engineer",
      },
      HR: {
        intern: "HR Intern",
        staff: "HR Generalist",
        senior: "Senior HR Manager",
      },
      ACCOUNTS: {
        intern: "Accounting Intern",
        staff: "Junior Accountant",
        senior: "Senior Accountant",
      }
    };

    setDesignation(mapping[currentDept]?.[currentRole] || "");
  };

  const handleRoleChange = (val: string) => {
    setRole(val);
    updateAutoFields(val, department);
  };

  const handleDeptChange = (val: string) => {
    setDepartment(val);
    updateAutoFields(role, val);
  };

  const createUser = async () => {
    if (!email || !password || !role || !department || !designation || level === "") {
      toast({ title: "Incomplete Form", description: "Please fill in all fields before creating a user.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/api/auth/register", {
        email, password, role, department, designation, designation_level: level
      });

      if (res.status === 200 || res.status === 201) {
        toast({ title: "User Created", description: `${designation} (Level ${level}) has been registered successfully.` });
        setEmail(""); setPassword(""); setRole(""); setDepartment(""); setDesignation(""); setLevel("");
      }
    } catch (error: any) {
      toast({ title: "Server Error", description: error?.response?.data?.message || "Could not create user. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 p-8 relative overflow-y-auto">
        <div className="absolute top-6 right-8 z-50">
          <UserProfileCard />
        </div>

        <div className="max-w-2xl mx-auto mt-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UserPlus className="w-6 h-6 text-primary" /> Add New User
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Provision a new account with automated role and designation mapping.
            </p>
          </div>

          <div className="glass-card p-8 rounded-xl border border-border space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg outline-none focus:border-primary text-sm transition-colors placeholder:text-muted-foreground" 
                    placeholder="analyst@zerotrust.io" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Temporary Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="password" 
                    className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg outline-none focus:border-primary text-sm transition-colors placeholder:text-muted-foreground" 
                    placeholder="••••••••" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Base Role</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select 
                    className="w-full pl-10 pr-10 py-2.5 bg-secondary/50 border border-border rounded-lg appearance-none cursor-pointer outline-none focus:border-primary text-sm transition-colors text-foreground" 
                    value={role} 
                    onChange={(e) => handleRoleChange(e.target.value)}
                  >
                    <option className="bg-background text-foreground" value="" disabled>Select Role</option>
                    <option className="bg-background text-foreground" value="intern">Intern</option>
                    <option className="bg-background text-foreground" value="staff">Staff</option>
                    <option className="bg-background text-foreground" value="senior">Senior</option>
                    <option className="bg-background text-foreground" value="admin">Admin</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* Department Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select 
                    className="w-full pl-10 pr-10 py-2.5 bg-secondary/50 border border-border rounded-lg appearance-none cursor-pointer outline-none focus:border-primary text-sm transition-colors text-foreground" 
                    value={department} 
                    onChange={(e) => handleDeptChange(e.target.value)}
                  >
                    <option className="bg-background text-foreground" value="" disabled>Select Department</option>
                    <option className="bg-background text-foreground" value="IT">IT</option>
                    <option className="bg-background text-foreground" value="HR">HR</option>
                    <option className="bg-background text-foreground" value="ACCOUNTS">ACCOUNTS</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* Auto-Designation (Read Only) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  Mapped Designation
                  <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">Auto</span>
                </label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <div className="w-full pl-10 pr-4 py-2.5 bg-secondary/30 border border-border/50 rounded-lg text-sm text-muted-foreground/80 flex items-center min-h-[42px]">
                    {designation || "Pending assignment..."}
                  </div>
                </div>
              </div>

              {/* Auto-Level (Read Only) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  Access Level
                  <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">Auto</span>
                </label>
                <div className="w-full px-4 py-2.5 bg-secondary/30 border border-border/50 rounded-lg text-sm text-muted-foreground/80 flex justify-between items-center min-h-[42px]">
                  <span>{level ? `Level ${level}` : "Pending assignment..."}</span>
                  {level && <ShieldCheck className="w-4 h-4 text-primary/70" />}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border mt-6">
              <button 
                onClick={createUser} 
                disabled={loading || !email || !password || !role || !department} 
                className="w-full sm:w-auto px-8 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 ml-auto"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {loading ? "Provisioning..." : "Provision User"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AddUser;
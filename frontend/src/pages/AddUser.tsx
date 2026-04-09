import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { ChevronDown, Loader2, ShieldCheck } from "lucide-react"; 
import api from "../api/axios";

const AddUser = () => {
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
      alert("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/api/auth/register", {
        email, password, role, department, designation, designation_level: level
      });

      if (res.status === 200 || res.status === 201) {
        alert(`User created: ${designation} (Level ${level})`);
        setEmail(""); setPassword(""); setRole(""); setDepartment(""); setDesignation(""); setLevel("");
      }
    } catch (error) {
      alert("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#020817] text-slate-50 font-sans">
      <AppSidebar />
      <main className="flex-1 p-8 relative overflow-y-auto">
        <div className="absolute top-6 right-8 z-50">
          <UserProfileCard />
        </div>

        <div className="max-w-2xl mx-auto mt-10">
          <h1 className="text-2xl font-bold mb-6">Add New User</h1>
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-xl space-y-4 shadow-2xl backdrop-blur-sm">
            
            <input className="w-full p-3 bg-slate-950 border border-slate-800 rounded-md outline-none focus:border-blue-500" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" className="w-full p-3 bg-slate-950 border border-slate-800 rounded-md outline-none focus:border-blue-500" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />

            {/* Role Selection */}
            <div className="relative">
              <select className="w-full p-3 bg-slate-950 border border-slate-800 rounded-md appearance-none cursor-pointer outline-none focus:border-blue-500" value={role} onChange={(e) => handleRoleChange(e.target.value)}>
                <option value="" disabled>Select Role</option>
                <option value="intern">Intern</option>
                <option value="staff">Staff</option>
                <option value="senior">Senior</option>
                <option value="admin">Admin</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            {/* Department Selection */}
            <div className="relative">
              <select className="w-full p-3 bg-slate-950 border border-slate-800 rounded-md appearance-none outline-none focus:border-blue-500" value={department} onChange={(e) => handleDeptChange(e.target.value)}>
                <option value="" disabled>Select Department</option>
                <option value="IT">IT</option>
                <option value="HR">HR</option>
                <option value="ACCOUNTS">ACCOUNTS</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            {/* Auto-Designation (Read Only) */}
            <div className="relative">
              <div className="w-full p-3 bg-slate-900/30 border border-slate-800 rounded-md text-slate-400">
                {designation || "Designation (Auto-set)"}
              </div>
            </div>

            {/* Auto-Level (Read Only) */}
            <div className="relative">
              <div className="w-full p-3 bg-slate-900/30 border border-slate-800 rounded-md text-slate-400 flex justify-between items-center">
                <span>{level ? `Level ${level}` : "Level (Auto-set)"}</span>
                <ShieldCheck className="w-4 h-4 text-blue-500/50" />
              </div>
            </div>

            <button onClick={createUser} disabled={loading} className="w-full sm:w-48 py-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create User"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AddUser;
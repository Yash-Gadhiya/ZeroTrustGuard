import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Upload } from "lucide-react";
import api from "../api/axios";

const EmployeeUpload = () => {

const role = localStorage.getItem("ztg_role") || "intern";

const isIntern = role === "intern";
const isStaff = role === "staff";
const isSenior = role === "senior";

const [file, setFile] = useState<File | null>(null);

const [allowIntern, setAllowIntern] = useState(false);
const [allowStaff, setAllowStaff] = useState(true);
const [allowSenior, setAllowSenior] = useState(true);

const [sensitivity, setSensitivity] = useState("low");
const [targetDepartments, setTargetDepartments] = useState<string[]>(["All Departments"]);

// Fetch user's own department to pre-select the dropdown
useEffect(() => {
  api.get("/api/auth/profile").then(res => {
    const dept = res.data?.user?.department || res.data?.department || "";
    if (dept) setTargetDepartments([dept]);
  }).catch(() => {}); // silent fail — default stays "All Departments"
}, []);

useEffect(() => {
  if (isIntern) {
    // Interns: Everyone gets access, sensitivity low
    setAllowIntern(true);
    setAllowStaff(true);
    setAllowSenior(true);
    setSensitivity("low");
  } else if (isStaff) {
    // Staff: Cannot remove staff/senior, but intern is optional
    setAllowIntern(false);
    setAllowStaff(true);
    setAllowSenior(true);
    if (sensitivity === "critical") {
      setSensitivity("high"); // Fallback if somehow stuck on critical
    }
  } else if (isSenior) {
    // Senior: Cannot remove senior, but intern/staff are optional
    setAllowIntern(false);
    setAllowStaff(false);
    setAllowSenior(true);
  }
  // Admins: Default to nothing selected
}, [role, sensitivity]);

const uploadFile = async () => {


if (!file) {
  alert("Select file first");
  return;
}

const formData = new FormData();

formData.append("file", file);
formData.append("allowIntern", String(allowIntern));
formData.append("allowStaff", String(allowStaff));
formData.append("allowSenior", String(allowSenior));
formData.append("sensitivityLevel", sensitivity);
formData.append("targetDepartments", JSON.stringify(targetDepartments));

try {

  const res = await api.post("/api/files/upload", formData);

  alert(res.data?.message || "File uploaded successfully");

  setFile(null);
  setTargetDepartments(["All Departments"]); // Reset to default after upload

} catch (error: any) {

  console.error("Upload error:", error);
  const msg = error.response?.data?.message || error.response?.data?.error || error.message || "Upload failed. Please try again.";
  alert(`Upload failed: ${msg}`);

}


};

return (

<div className="flex min-h-screen bg-background">

  <AppSidebar />

  <main className="flex-1 p-8 text-foreground">

    <h1 className="text-2xl font-bold mb-6">
      Upload File
    </h1>

    <div className="glass-card p-6 max-w-xl space-y-6">

      {/* FILE INPUT */}
      <div>

        <label className="text-sm text-muted-foreground">
          Select File
        </label>

        <div className="mt-2 flex items-center gap-3">

          <label className="cursor-pointer bg-secondary border border-border px-4 py-2 rounded-md hover:bg-secondary/80">
            Choose File
            <input
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          {file && (
            <span className="text-sm text-muted-foreground">
              {file.name}
            </span>
          )}

        </div>

      </div>

      {/* ACCESS PERMISSIONS */}
      <div>

        <label className="text-sm text-muted-foreground">
          Access Permissions
        </label>

        <div className="flex gap-6 mt-3">

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowIntern}
              disabled={isIntern}
              onChange={(e) => setAllowIntern(e.target.checked)}
            />
            Intern
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowStaff}
              disabled={isIntern || isStaff}
              onChange={(e) => setAllowStaff(e.target.checked)}
            />
            Staff
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowSenior}
              disabled={isIntern || isStaff || isSenior}
              onChange={(e) => setAllowSenior(e.target.checked)}
            />
            Senior
          </label>

        </div>

      </div>

      {/* SENSITIVITY */}
      <div>

        <label className="text-sm text-muted-foreground">
          Sensitivity Level
        </label>

        <select
          value={sensitivity}
          disabled={isIntern}
          className="mt-2 w-full bg-secondary text-foreground p-2 rounded-md border border-border"
          onChange={(e) => setSensitivity(e.target.value)}
        >

          <option value="low">Low</option>
          {(!isIntern) && <option value="high">High</option>}
          {(!isIntern && !isStaff) && <option value="critical">Critical</option>}

        </select>

      </div>

      {/* TARGET DEPARTMENT */}
      <div>
        <label className="text-sm text-muted-foreground block mb-2">
          Visibility (Target Departments)
        </label>
        
        <div className="flex flex-wrap gap-2">
          {["All Departments", "IT", "HR", "ACCOUNTS"].map((dept) => {
            const isSelected = targetDepartments.includes(dept);
            return (
              <button
                key={dept}
                type="button"
                onClick={() => {
                  if (dept === "All Departments") {
                    setTargetDepartments(["All Departments"]);
                  } else {
                    let newDepts = targetDepartments.filter(d => d !== "All Departments");
                    if (isSelected) {
                      newDepts = newDepts.filter(d => d !== dept);
                      if (newDepts.length === 0) newDepts = ["All Departments"];
                    } else {
                      newDepts.push(dept);
                    }
                    setTargetDepartments(newDepts);
                  }
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                  isSelected
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-secondary/50 border-border text-muted-foreground hover:border-sidebar-accent"
                }`}
              >
                {dept}
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground mt-2">
          Who can see this file. Selected: {targetDepartments.join(", ")}
        </p>
      </div>

      {/* UPLOAD BUTTON */}
      <button
        onClick={uploadFile}
        className="flex items-center gap-2 bg-primary hover:bg-primary/90 px-4 py-2 rounded-lg text-white"
      >
        <Upload size={16} />
        Upload File
      </button>

    </div>

  </main>

</div>


);
};

export default EmployeeUpload;

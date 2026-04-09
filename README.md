=====================================================
          ZEROTRUSTGUARD - SETUP GUIDE
=====================================================

ZeroTrustGuard is a specialized SOC platform for 
Vulnerability Scanning and Secure File Management.

-----------------------------------------------------
1. PREREQUISITES
-----------------------------------------------------
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- Nmap (installed and added to System PATH)

-----------------------------------------------------
2. DATABASE SETUP (CRITICAL)
-----------------------------------------------------
1. Open pgAdmin 4 or psql.
2. Create a NEW database named: zerotrust
3. Right-click the 'zerotrust' database -> Query Tool.
4. Open the 'zerotrust_backup.sql' file provided in the group.
5. Press F5 (Execute) to import all tables and the Admin user.

-----------------------------------------------------
3. BACKEND CONFIGURATION
-----------------------------------------------------
1. Go to the /backend folder.
2. Create a file named '.env'.
3. Add the following lines (update with your credentials):

   PORT=8081
   DB_NAME=zerotrust
   DB_USER=postgres
   DB_PASSWORD=YOUR_POSTGRES_PASSWORD_HERE
   DB_HOST=localhost
   JWT_SECRET=your_super_secret_key

-----------------------------------------------------
4. RUNNING THE APPLICATION
-----------------------------------------------------
STEP 1: Start Backend
   - Open terminal in /backend
   - Run: npm install
   - Run: npm start

STEP 2: Start Frontend
   - Open a new terminal in /frontend
   - Run: npm install
   - Run: npm start

-----------------------------------------------------
5. DEFAULT LOGIN
-----------------------------------------------------
- Email: admin@ztg.com
- Password: admin123

-----------------------------------------------------
6. USERS LOGIN 
-----------------------------------------------------

IT Department

{
  "email": "it.intern1@ztg.com",
  "password": "intern123",
  "role": "intern",
  "department": "IT",
  "designation": "IT Intern",
  "designation_level": 1
}

{
  "email": "it.intern2@ztg.com",
  "password": "intern123",
  "role": "intern",
  "department": "IT",
  "designation": "IT Intern",
  "designation_level": 1
}

{
  "email": "it.staff1@ztg.com",
  "password": "staff123",
  "role": "staff",
  "department": "IT",
  "designation": "Staff Engineer",
  "designation_level": 2
}

{
  "email": "it.staff2@ztg.com",
  "password": "staff123",
  "role": "staff",
  "department": "IT",
  "designation": "Staff Engineer",
  "designation_level": 2
}

{
  "email": "it.senior1@ztg.com",
  "password": "
",
  "role": "senior",
  "department": "IT",
  "designation": "Senior Systems Engineer",
  "designation_level": 3
}

{
  "email": "it.senior2@ztg.com",
  "password": "
",
  "role": "senior",
  "department": "IT",
  "designation": "Senior Systems Engineer",
  "designation_level": 3
}

Accounts Department

{
  "email": "acc.intern1@ztg.com",
  "password": "intern123",
  "role": "intern",
  "department": "ACCOUNTS",
  "designation": "Accounting Intern",
  "designation_level": 1
}


{
  "email": "acc.staff1@ztg.com",
  "password": "staff123",
  "role": "staff",
  "department": "ACCOUNTS",
  "designation": "Junior Accountant",
  "designation_level": 2
}

{
  "email": "acc.staff2@ztg.com",
  "password": "staff123",
  "role": "staff",
  "department": "ACCOUNTS",
  "designation": "Junior Accountant",
  "designation_level": 2
}

{
  "email": "acc.staff3@ztg.com",
  "password": "staff123",
  "role": "staff",
  "department": "ACCOUNTS",
  "designation": "Junior Accountant",
  "designation_level": 2
}

{
  "email": "acc.senior1@ztg.com",
  "password": "senior123",
  "role": "senior",
  "department": "ACCOUNTS",
  "designation": "Senior Accountant",
  "designation level": 3
}

{
  "email": "acc.senior2@ztg.com",
  "password": "senior123",
  "role": "senior",
  "department": "ACCOUNTS",
  "designation": "Senior Accountant",
  "designation_level": 3
}


HR Department

{
  "email": "hr.intern1@ztg.com",
  "password": "intern123",
  "role": "intern",
  "department": "HR",
  "designation": "HR Intern",
  "designation_level": 1
}



{
  "email": "hr.staff1@ztg.com",
  "password": "staff123",
  "role": "staff",
  "department": "HR",
  "designation": "HR Generalist",
  "designation_level": 2
}


{
  "email": "hr.senior1@ztg.com",
  "password": "senior123",
  "role": "senior",
  "department": "HR",
  "designation": "Senior HR Manager",
  "designation_level": 3
}

{
  "email": "hr.senior2@ztg.com",
  "password": "senior123",
  "role": "senior",
  "department": "HR",
  "designation": "Senior HR Manager",
  "designation_level": 3
}


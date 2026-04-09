const { spawn } = require("child_process");
const fs = require("fs");
const WebScan = require("../../models/WebScan");
const PDFDocument = require("pdfkit");

// Global registry: maps scanId -> nmap child process
const activeScans = new Map();
let _scanIdCounter = Date.now();

exports.runScan = async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const scanType = req.body.scanType || "Quick";
    let target = req.body.targetUrl || "localhost";
    const sessionScanId = ++_scanIdCounter;
    
    // strip http/https for nmap since nmap takes hostname/IP natively
    target = target.replace(/^https?:\/\//, '').replace(/\/$/, '');

    let args = [];
    let scanMessage = `Initializing Nmap Engine for ${scanType} Audit...`;

    if (scanType === "Stealth") {
        args = ["-sS", "-T2", target];
    } else if (scanType === "Vuln") {
        args = ["--script", "vuln", target];
    } else if (scanType === "Full") {
        args = ["-p-", "-sV", "-A", "-T4", target]; // -A provides OS + versions without needing strict -O
    } else if (scanType === "HEADER_AUDIT") {
        args = ["--script", "http-security-headers", target];
        scanMessage = `Scanning Web Headers...`;
    } else if (scanType === "SSL_SCAN" || scanType === "SSL/TLS Scan") {
        args = ["--script", "ssl-enum-ciphers,ssl-cert", "-p", "443", target];
        scanMessage = `Analyzing SSL Ciphers...`;
    } else if (scanType === "CMS_SCAN") {
        args = ["--script", "http-enum,http-wordpress-enum", target];
        scanMessage = `Detecting Content Management Systems...`;
    } else { 
        args = ["-T4", "-F", target];
    }

    // Manual Path Check for Windows
    let nmapCommand = "nmap";
    const commonPaths = [
        "C:\\Program Files (x86)\\Nmap\\nmap.exe",
        "C:\\Program Files\\Nmap\\nmap.exe"
    ];
    
    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            // Must wrap in quotes for paths with spaces over shell
            nmapCommand = `"${p}"`;
            break;
        }
    }

    res.write(`[JARVIS] ${scanMessage}\n`);
    res.write(`[SCAN] Target acquired: ${target}\n`);
    res.write(`[SYS] Session ID: ${sessionScanId}\n`);
    res.write(`[SYS] Executing: ${nmapCommand} ${args.join(" ")}\n\n`);

    const scanLabel = {
        Quick: "Quick Scan",
        Stealth: "Stealth Scan",
        Vuln: "Vulnerability Scan",
        Full: "Full Scan",
        HEADER_AUDIT: "Header Audit",
        SSL_SCAN: "SSL/TLS Scan",
        CMS_SCAN: "CMS Detection"
    }[scanType] || scanType;

    const nmapProcess = spawn(nmapCommand, args, { shell: true });
    // Store full metadata so stopScan can write the DB record directly
    activeScans.set(sessionScanId, { proc: nmapProcess, target, scanType, scanLabel });
    let fullOutput = "";
    let handshaken = false;
    let wasCancelled = false;

    nmapProcess.stdout.on('data', (data) => {
        if (!handshaken) {
            res.write(`[JARVIS] Nmap Engine successfully linked. Handshaking with target...\n\n`);
            handshaken = true;
        }
        const text = data.toString();
        fullOutput += text;
        res.write(text); // stream raw nmap lines directly to frontend console
    });

    nmapProcess.stderr.on('data', (data) => {
        if (!handshaken) {
            res.write(`[JARVIS] Nmap Engine successfully linked. Handshaking with target...\n\n`);
            handshaken = true;
        }
        const text = data.toString();
        fullOutput += text;
        res.write(`[ERROR/NMAP] ${text}\n`);
    });

    nmapProcess.on('error', (err) => {
        activeScans.delete(sessionScanId);
        res.write(`[ERROR] Failed to execute Nmap process: ${err.message} (${err.code})\n`);
        res.write(`[SYS] Engine failure. Ensure Nmap is installed locally.\n`);
        res.write(`---FINISHED---\n`);
        res.end(); 
    });

    nmapProcess.on('close', async (code, signal) => {
        activeScans.delete(sessionScanId);
        wasCancelled = signal === 'SIGKILL' || signal === 'SIGINT' || code === null;
        res.write(`[JARVIS] Nmap Scan terminated with exit code ${code}.\n`);
        if (wasCancelled) {
          res.write(`[JARVIS] Scan aborted by Admin. Audit trail updated, but no report was generated.\n`);
        } else {
          res.write(`[SYS] Parsing results into Central Database...\n`);
        }

        const findings = [];
        let calculatedRiskScore = 0;
        const lines = fullOutput.split('\n');
        
        lines.forEach(line => {
            // "80/tcp  open  http    nginx 1.18.0"
            const portMatch = line.match(/^(\d+)\/(tcp|udp)\s+open\s+(.*)/);
            if (portMatch) {
               findings.push({
                   severity: ["80", "443"].includes(portMatch[1]) ? "Info" : "Medium",
                   type: "Network Port",
                   endpoint: `Port ${portMatch[1]} (${portMatch[2]})`,
                   description: `Service identified: ${portMatch[3].trim()}`
               });
            }

            if (line.includes("VULNERABLE:") || line.includes("| _vulnerability") || line.toLowerCase().includes("vulnerable")) {
               calculatedRiskScore = Math.max(calculatedRiskScore, 90);
               findings.push({
                   severity: "High",
                   type: "Vulnerability Module Alert",
                   endpoint: target,
                   description: line.trim()
               });
            }

            const cData = line.match(/(TLSv\d\.\d|SSLv\d\.\d)/);
            if (line.includes("Grade: C") || line.includes("Grade: D") || line.includes("Grade: F")) {
               calculatedRiskScore = Math.max(calculatedRiskScore, 85);
               findings.push({
                   severity: "High",
                   type: "Weak Cipher",
                   endpoint: target,
                   description: line.trim()
               });
            }

            if (line.toLowerCase().includes("expired")) {
               calculatedRiskScore = Math.max(calculatedRiskScore, 100);
               findings.push({
                   severity: "Critical",
                   type: "Certificate Expiry",
                   endpoint: target,
                   description: "SSL Certificate is expired."
               });
            }

            if (line.includes("Strict-Transport-Security") || line.includes("Content-Security-Policy")) {
               if (line.includes("missing") || line.includes("not set")) {
                  calculatedRiskScore = Math.max(calculatedRiskScore, 70);
                  findings.push({
                      severity: "High",
                      type: "Missing Header",
                      endpoint: target,
                      description: "MISSING HEADERS: " + line.trim()
                  });
               }
            }

            if (line.includes("outdated") || line.match(/version\s+[\d\.]+\s*.*(outdated|deprecated)/i)) {
               calculatedRiskScore = Math.max(calculatedRiskScore, 90);
               findings.push({
                   severity: "Critical",
                   type: "Outdated CMS",
                   endpoint: target,
                   description: "OUTDATED CMS: " + line.trim()
               });
            }
        });

        if (findings.length === 0) {
           findings.push({ severity: "Info", type: "Scan Complete", endpoint: target, description: "No explicit open ports or vulnerabilities mapped under current profile." });
        }

        const scanResults = {
            target: target,
            scanType: scanType,
            riskScore: calculatedRiskScore,
            findings
        };

        const scanLabel = {
            Quick: "Quick Scan",
            Stealth: "Stealth Scan",
            Vuln: "Vulnerability Scan",
            Full: "Full Scan",
            HEADER_AUDIT: "Header Audit",
            SSL_SCAN: "SSL/TLS Scan",
            CMS_SCAN: "CMS Detection"
        }[scanType] || scanType;

        // Skip persisting if process was force-killed — stopScan already wrote the record
        if (wasCancelled) {
            res.write(`[SYS] Stop acknowledged by close event. Audit record already written by stop controller.\n`);
            res.write('---FINISHED---\n');
            res.end();
            return;
        }

        try {
            // Always save a record — CANCELLED scans still get an audit trail entry
            const newScan = await WebScan.create({
                status: wasCancelled ? "CANCELLED" : "COMPLETED",
                scan_type: scanLabel,
                vulnerabilities: {
                    ...scanResults,
                    // Mark report_path null for cancelled scans so PDF request is blocked
                    report_path: wasCancelled ? null : undefined,
                    partial: wasCancelled
                }
            });

            if (wasCancelled) {
                res.write(`[SYS] Partial audit trail saved (ID: ${newScan.id}). No PDF report generated.\n`);
            } else {
                res.write(`[JARVIS] Successfully saved configuration to Database (ID: ${newScan.id})\n`);
            }

            res.write('---FINISHED---\n');
            res.write(JSON.stringify({ scanId: newScan.id, results: scanResults }) + "\n");
        } catch (err) {
            console.error(err);
            res.write(`[ERROR] Database save failed: ${err.message}\n`);
            res.write('---FINISHED---\n');
        }
        
        res.end();
    });
};

exports.generatePdfReport = async (req, res) => {
  try {
    const { id } = req.params;
    const scan = await WebScan.findByPk(id);

    if (!scan) {
      return res.status(404).json({ error: "Scan not found" });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=ZeroTrustGuard_Audit_${id}.pdf`);
    doc.pipe(res);

    // 1. Watermark & Background Management
    const drawBackground = () => {
        doc.save(); // Isolate opacity to this scope
        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#0f172a');
        
        doc.translate(doc.page.width / 2, doc.page.height / 2);
        doc.rotate(-45);
        doc.fillOpacity(0.05);
        doc.fillColor('#cbd5e1');
        doc.font('Helvetica-Bold').fontSize(80);
        const textStr = 'CONFIDENTIAL';
        doc.text(textStr, -doc.widthOfString(textStr) / 2, -doc.currentLineHeight() / 2, { lineBreak: false });
        doc.restore(); // Return to fully opaque bounds securely!
    };

    // Ensure watermark is drawn first on each page
    doc.on('pageAdded', drawBackground);
    drawBackground(); // Render on the initial page

    // Table Header Logic
    const drawTableHeaders = () => {
        const currentY = doc.y;
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#cbd5e1');
        doc.text('Port', 50, currentY, { width: 80 });
        doc.text('State', 150, currentY, { width: 80 });
        doc.text('Service', 250, currentY);
        doc.moveDown(0.5);
        doc.rect(50, doc.y, 450, 1).fill('#334155');
        doc.y += 10;
    };

    // 2. Table Row Pagination (checkPageBreak)
    const checkPageBreak = (threshold = 720) => {
        if (doc.y > threshold) {
            doc.addPage();
            drawTableHeaders(); 
        }
    };

    const drawSlice = (cx, cy, radius, startAngle, endAngle, color) => {
        if (endAngle <= startAngle) return;
        if (endAngle - startAngle >= Math.PI * 1.99) {
            doc.circle(cx, cy, radius).fill(color);
            return;
        }
        const x1 = cx + radius * Math.cos(startAngle);
        const y1 = cy + radius * Math.sin(startAngle);
        const x2 = cx + radius * Math.cos(endAngle);
        const y2 = cy + radius * Math.sin(endAngle);
        const largeArc = (endAngle - startAngle > Math.PI) ? 1 : 0;
        doc.path(`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`).fill(color);
    };

    // Document Metadata Pre-Processing
    const vulns = scan.vulnerabilities || {};
    const scanProfile = scan.scan_type || vulns.scanType || "Unknown Scan";
    const findings = vulns.findings || [];
    const portFindings = findings.filter(f => f.type === "Network Port");
    const otherFindings = findings.filter(f => f.type !== "Network Port");

    // Critical Ports Parsing
    let criticalPortCount = 0;
    portFindings.forEach(pf => {
        const pMatch = pf.endpoint.match(/\d+/);
        if (pMatch && [21, 22, 23, 3306, 5432, 1433, 27017].includes(parseInt(pMatch[0]))) {
            criticalPortCount++;
        }
    });

    // Header Rendering
    doc.fillColor('#f8fafc');
    doc.font('Helvetica-Bold').fontSize(26).text("ZeroTrustGuard", 50, 50, { align: "center" });
    doc.font('Helvetica').fillColor('#94a3b8').fontSize(14).text("Enterprise Security Audit Report", { align: "center" });
    doc.moveDown(1.5);
    
    // Dynamic Risk Badge (Secure doc.y logic)
    const riskBadgeColor = criticalPortCount > 10 ? '#ef4444' : (criticalPortCount > 0 ? '#f97316' : '#10b981');
    const riskBadgeText = criticalPortCount > 10 ? 'HIGH RISK' : (criticalPortCount > 0 ? 'ELEVATED RISK' : 'SECURE');
    
    const badgeY = doc.y;
    doc.rect(doc.page.width / 2 - 60, badgeY, 120, 20).fill(riskBadgeColor);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text(riskBadgeText, doc.page.width / 2 - 60, badgeY + 6, { width: 120, align: 'center' });
    doc.y = badgeY + 40; // Explicit shift down securely

    // Scan Metadata
    const metadataY = doc.y;
    doc.fillColor('#f8fafc').font('Helvetica-Bold').fontSize(14).text("Scan Metadata", 50, metadataY);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11).fillColor('#cbd5e1');
    doc.text(`Scan ID: ${scan.id}`);
    doc.text(`Scan Profile: ${scanProfile}`);
    doc.text(`Scan Type: ${scan.scan_type || scanProfile}`);
    doc.text(`Status: ${scan.status || 'COMPLETED'}`);
    doc.text(`Target: ${vulns.target || "Unknown"}`);
    const scanDate = new Date(scan.createdAt || scan.scanDate).toLocaleString();
    doc.text(`Completed: ${scanDate}`);
    const metaBottomY = doc.y;
    
    // Draw Risk Pie Chart natively floating in top right corners!
    const cx = doc.page.width - 120;
    const cy = metadataY + 40;
    const r = 35;
    const openCount = portFindings.length;
    
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#f8fafc').text("Crit/High vs Low/Info", cx - 55, cy - 50, { width: 110, align: 'center' });
    if (openCount === 0) {
        drawSlice(cx, cy, r, 0, Math.PI * 2, '#22c55e'); // Full Green (Low/Info)
    } else {
        const criticalAngle = (criticalPortCount / openCount) * Math.PI * 2;
        drawSlice(cx, cy, r, 0, criticalAngle, '#ef4444'); // Red criticals
        drawSlice(cx, cy, r, criticalAngle, Math.PI * 2, '#22c55e'); // Green standard
    }

    // Align layout cleanly under whichever is longest natively
    doc.y = Math.max(metaBottomY, cy + r + 10) + 20;

    // Port Density Bar (Background Track + Foreground Gradient)
    doc.fillColor('#f8fafc').font('Helvetica-Bold').fontSize(14).text("Attack Surface Density", 50, doc.y);
    doc.moveDown(0.5);
    
    // Background Track
    const densityY = doc.y;
    doc.lineJoin('round').rect(50, densityY, 400, 12).fill('#334155');
    
    // Foreground Fill Segment
    if (openCount > 0) {
        const fillRatio = Math.min(openCount / 20, 1); // Fills completely at 20+ ports
        const densityGrad = doc.linearGradient(50, densityY, 450, densityY);
        densityGrad.stop(0, '#22c55e').stop(1, '#ef4444');
        doc.lineJoin('round').rect(50, densityY, 400 * fillRatio, 12).fill(densityGrad);
    }
    
    doc.y = densityY + 20;
    doc.fillColor('#cbd5e1').font('Helvetica').fontSize(10).text(`Total Open Ports: ${openCount}`, 50, doc.y);
    doc.moveDown(2);

    // Nmap Results Summary Table
    if (portFindings.length > 0) {
        // Ensure we have enough space before the table header
        checkPageBreak(700);
        doc.fillColor('#f8fafc').font('Helvetica-Bold').fontSize(14).text('Nmap Results Summary', 50, doc.y);
        doc.moveDown(0.5);
        drawTableHeaders();
        
        doc.font('Helvetica').fontSize(10);
        portFindings.forEach((pf) => {
            // Pagination before each row
            checkPageBreak(720);
            
            const pMatch = pf.endpoint.match(/\d+/);
            const pNum = pMatch ? parseInt(pMatch[0]) : 0;
            const isCritical = [21, 23, 3306].includes(pNum);
            
            doc.fillColor(isCritical ? '#ef4444' : '#f8fafc');
            const currentY = doc.y;
            doc.text(pNum.toString(), 50, currentY, { width: 80, lineBreak: false });
            doc.text('open', 150, currentY, { width: 80, lineBreak: false });
            let serviceSummary = pf.description.replace("Service identified: ", "").trim();
            doc.text(serviceSummary, 250, currentY, { width: 280, height: 12, ellipsis: true });
            
            doc.y = currentY + 15;
        });
        doc.moveDown(2);
    }

    if (doc.y > 600) doc.addPage();

    // Consolidate AI Insights (2-column list) wrap-safe
    if (portFindings.length > 0) {
        doc.fillColor('#60a5fa').font('Helvetica-Bold').fontSize(14).text('AI Threat Analysis (JARVIS Insights)', 50, doc.y);
        doc.moveDown(0.5);
        
        const insights = portFindings.map(pf => {
            const pMatch = pf.endpoint.match(/\d+/);
            const pNum = pMatch ? parseInt(pMatch[0]) : 0;
            let insight = `Verify exposure via WAF/Firewall.`;
            switch (pNum) {
                case 80:
                case 443: insight = "Implement a Web Application Firewall (WAF) to filter SQLi and XSS payloads."; break;
                case 5000:
                case 8080:
                case 8081: insight = "These are common dev-tunnel or application ports. Ensure they are not exposing raw environment variables or administrative debug logs."; break;
                case 3306:
                case 5432: insight = "Database exposure detected. Enforce strict IP-white-listing and disable remote root login."; break;
                case 21: insight = "FTP is plaintext. Use SFTP."; break;
                case 22: insight = "Ensure key-based auth prevents dictionary attacks."; break;
                case 23: insight = "Telnet is unsecure. Migrate to SSH."; break;
            }
            return { port: pNum, text: insight };
        });

        const colWidth = 220;
        const leftColX = 50;
        const rightColX = 290;
        let isLeft = true;
        let columnStartY = doc.y;
        let maxRowHeight = 0;

        insights.forEach((item, index) => {
            doc.font('Helvetica-Bold').fontSize(9);
            const textStr = `[JARVIS] Port ${item.port}: ${item.text}`;
            const height = doc.heightOfString(textStr, { width: colWidth });

            if (columnStartY + height > 740 && isLeft) {
                doc.addPage();
                columnStartY = doc.y;
            }

            maxRowHeight = Math.max(maxRowHeight, height);
            const currentX = isLeft ? leftColX : rightColX;

            doc.fillColor('#fbbf24').font('Helvetica-Bold').text(`[JARVIS] Port ${item.port}: `, currentX, columnStartY, { width: colWidth, continued: true })
               .fillColor('#cbd5e1').font('Helvetica').text(item.text, { width: colWidth });

            if (isLeft) {
                isLeft = false; 
            } else {
                isLeft = true; 
                columnStartY += maxRowHeight + 10; 
                maxRowHeight = 0;
            }
        });
        
        doc.y = isLeft ? columnStartY : columnStartY + maxRowHeight + 10;
        doc.moveDown();
    }

    // Vulnerabilities
    if (otherFindings.length > 0) {
        if (doc.y > 600) doc.addPage();
        doc.fillColor('#f8fafc').font('Helvetica-Bold').fontSize(14).text('Vulnerability Discoveries', 50, doc.y);
        doc.moveDown(0.5);
        
        otherFindings.forEach((finding, index) => {
            if (doc.y > 720) doc.addPage();
            
            let color = '#38bdf8'; 
            if (finding.severity === "High" || finding.severity === "Critical") color = '#ef4444';
            else if (finding.severity === "Medium") color = '#f97316';

            const currentY = doc.y;
            doc.fillColor(color).font('Helvetica-Bold').fontSize(11).text(`${index + 1}. [${finding.severity}] ${finding.type}`, 50, currentY);
            doc.fillColor('#cbd5e1').font('Helvetica').fontSize(10).text(`Endpoint: ${finding.endpoint}`, 50, doc.y);
            doc.text(`Details: ${finding.description}`, 50, doc.y);
            doc.moveDown(1);
        });
    }

    // --- Dedicated Weak SSL Cipher Section (also for HEADER_AUDIT + SSL_SCAN) ---
    const weakCipherFindings = otherFindings.filter(f => f.type === "Weak Cipher");
    const missingHeaderFindings = otherFindings.filter(f => f.type === "Missing Header");
    const outdatedCmsFindings = otherFindings.filter(f => f.type === "Outdated CMS");

    if (weakCipherFindings.length > 0) {
        if (doc.y > 600) doc.addPage();
        doc.fillColor('#ef4444').font('Helvetica-Bold').fontSize(14).text('Weak SSL/TLS Ciphers Detected', 50, doc.y);
        doc.moveDown(0.5);
        doc.fillColor('#cbd5e1').font('Helvetica').fontSize(10)
            .text('The following cipher suites were identified as Grade C, D, or F — they are vulnerable to downgrade or cryptographic attacks.', 50, doc.y, { width: 490 });
        doc.moveDown();
        weakCipherFindings.forEach((cf, i) => {
            if (doc.y > 720) doc.addPage();
            doc.fillColor('#f97316').font('Helvetica-Bold').text(`${i + 1}. Weak Cipher:`, 50, doc.y, { continued: true });
            doc.fillColor('#cbd5e1').font('Helvetica').text(` ${cf.description.replace(/\s+/g, ' ').trim()}`);
        });
        doc.moveDown();
    }

    if (missingHeaderFindings.length > 0) {
        if (doc.y > 600) doc.addPage();
        doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(14).text('Missing Security Headers', 50, doc.y);
        doc.moveDown(0.5);
        doc.fillColor('#cbd5e1').font('Helvetica').fontSize(10)
            .text('Critical HTTP response headers were absent. These protect against clickjacking, XSS, and protocol downgrades.', 50, doc.y, { width: 490 });
        doc.moveDown();
        missingHeaderFindings.forEach((mh, i) => {
            if (doc.y > 720) doc.addPage();
            const rawHeader = mh.description.replace('MISSING HEADERS:', '').trim();
            doc.fillColor('#fbbf24').font('Helvetica-Bold').text(`${i + 1}. Missing Header:`, 50, doc.y, { continued: true });
            doc.fillColor('#cbd5e1').font('Helvetica').text(` ${rawHeader}`);
        });
        doc.moveDown();
    }

    if (outdatedCmsFindings.length > 0) {
        if (doc.y > 600) doc.addPage();
        doc.fillColor('#ef4444').font('Helvetica-Bold').fontSize(14).text('Outdated CMS / Software Detected', 50, doc.y);
        doc.moveDown(0.5);
        outdatedCmsFindings.forEach((oc, i) => {
            if (doc.y > 720) doc.addPage();
            const rawCms = oc.description.replace('OUTDATED CMS:', '').trim();
            doc.fillColor('#f97316').font('Helvetica-Bold').text(`${i + 1}. Outdated Component:`, 50, doc.y, { continued: true });
            doc.fillColor('#cbd5e1').font('Helvetica').text(` ${rawCms}`);
        });
        doc.moveDown();
    }

    // Explicit SSL/TLS Sector Check
    if (scanProfile === "SSL_SCAN" || scanProfile === "SSL/TLS Scan") {
        if (doc.y > 600) doc.addPage();
        doc.fillColor('#10b981').font('Helvetica-Bold').fontSize(14).text('Encryption Strength Analysis', 50, doc.y);
        doc.moveDown(0.5);
        doc.fillColor('#cbd5e1').font('Helvetica').fontSize(10).text('This section outlines the resilience of the negotiated cipher suites and the cryptographic validity of the endpoint certificate.', 50, doc.y, { width: 500 });
        doc.moveDown();
        
        const certExpiry = otherFindings.find(f => f.type === "Certificate Expiry");
        const weakCiphers = otherFindings.filter(f => f.type === "Weak Cipher");

        if (certExpiry) {
            doc.fillColor('#ef4444').font('Helvetica-Bold').text(`[CRITICAL] ${certExpiry.description}`, 50, doc.y);
            doc.moveDown();
        } else {
            doc.fillColor('#22c55e').font('Helvetica-Bold').text(`[SECURE] Certificate is valid and not objectively expired.`, 50, doc.y);
            doc.moveDown();
        }

        if (weakCiphers.length > 0) {
            doc.fillColor('#f97316').font('Helvetica-Bold').text(`Detected Weak Ciphers (Grade C/D/F):`, 50, doc.y);
            doc.moveDown(0.5);
            weakCiphers.forEach(cf => {
                // Remove extra whitespace from Nmap cipher strings for aesthetic print
                doc.fillColor('#cbd5e1').font('Helvetica').text(`- ${cf.description.replace(/\s+/g, ' ').trim()}`, 60, doc.y);
            });
            doc.moveDown();
        } else {
            doc.fillColor('#22c55e').font('Helvetica-Bold').text(`[SECURE] No explicit Grade C, D, or F ciphers detected on active listeners.`, 50, doc.y);
            doc.moveDown();
        }
    }

    doc.end();

  } catch (error) {
    console.error("PDF Generate Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate dynamic enterprise report" });
    }
  }
};

exports.getScans = async (req, res) => {
  try {
    const { timeRange, targetFilter } = req.query;
    const { Op } = require("sequelize");

    let whereClause = {};
    const now = new Date();

    if (timeRange) {
      if (timeRange === "24_hours") {
        whereClause.createdAt = { [Op.gte]: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
      } else if (timeRange === "7_days") {
        whereClause.createdAt = { [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
      } else if (timeRange === "30_days") {
        whereClause.createdAt = { [Op.gte]: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
      }
    }

    if (targetFilter) {
        whereClause.vulnerabilities = {
            target: { [Op.iLike]: `%${targetFilter}%` }
        };
    }

    const scans = await WebScan.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });
    res.status(200).json({ scans });
  } catch (error) {
    console.error("Fetch Scans Error:", error);
    res.status(500).json({ error: "Failed to fetch scans" });
  }
};

exports.stopScan = async (req, res) => {
  const { sessionScanId } = req.body;

  // Helper: force-kill a process and destroy its I/O streams
  const forceKill = (proc) => {
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch (_) {
      try { proc.kill("SIGKILL"); } catch (_2) { /* ignore */ }
    }
    try { proc.stdout.destroy(); } catch (_) {}
    try { proc.stderr.destroy(); } catch (_) {}
  };

  // Helper: write the CANCELLED audit record and return it
  const writeCancelledRecord = async (target, scanLabel) => {
    return await WebScan.create({
      status: "CANCELLED",
      scan_type: scanLabel,
      vulnerabilities: {
        target: target,
        scanType: scanLabel,
        riskScore: 0,
        partial: true,
        report_path: null,
        findings: [{ severity: "Info", type: "Scan Cancelled", endpoint: target, description: "Scan was manually terminated by an administrator." }]
      }
    });
  };

  // Resolve the active scan entry — either by session ID or the most recent
  let key, entry;
  if (!sessionScanId) {
    if (activeScans.size === 0) {
      return res.status(404).json({ message: "No active scan to stop." });
    }
    key = [...activeScans.keys()].pop();
    entry = activeScans.get(key);
  } else {
    key = Number(sessionScanId);
    entry = activeScans.get(key);
  }

  if (!entry) {
    return res.status(404).json({ message: "Scan session not found or already completed." });
  }

  // Kill the process immediately
  forceKill(entry.proc);
  activeScans.delete(key);

  // Write audit record synchronously before responding
  try {
    const cancelled = await writeCancelledRecord(entry.target, entry.scanLabel);
    return res.status(200).json({
      message: "Emergency stop executed. Audit record created.",
      auditId: cancelled.id,
      scanType: entry.scanLabel,
      target: entry.target
    });
  } catch (dbErr) {
    console.error("Failed to write CANCELLED audit record:", dbErr);
    return res.status(200).json({
      message: "Process terminated, but audit record failed to save.",
      error: dbErr.message
    });
  }
};

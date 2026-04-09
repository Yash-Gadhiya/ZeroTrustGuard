import { X, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

interface SecureFileViewerProps {
  url: string | null;
  filename?: string;
  onClose: () => void;
}

export const SecureFileViewer = ({ url, filename, onClose }: SecureFileViewerProps) => {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [isImageZoomed, setIsImageZoomed] = useState(false);

  useEffect(() => {
    if (url) {
      document.body.style.overflow = "hidden";
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [url, onClose]);

  const extension = filename?.split(".").pop()?.toLowerCase();
  
  const isImage = ["jpg", "jpeg", "png", "webp", "gif"].includes(extension || "");
  const isText = ["txt", "log", "json"].includes(extension || "");
  const isExcel = ["csv", "xlsx", "xls"].includes(extension || "");
  const isPDF = ["pdf"].includes(extension || "");

  useEffect(() => {
    if (!url || !extension) return;
    
    if (isText) {
      setLoading(true);
      fetch(url)
        .then((res) => res.text())
        .then((text) => {
          setContent(text);
          setLoading(false);
        })
        .catch(() => {
          setContent("Error reading text file.");
          setLoading(false);
        });
    } else if (isExcel) {
      setLoading(true);
      fetch(url)
        .then((res) => res.arrayBuffer())
        .then((buffer) => {
          try {
            const workbook = XLSX.read(buffer, { type: "array" });
            const sheetName = workbook.SheetNames[0];
            const htmlStr = XLSX.utils.sheet_to_html(workbook.Sheets[sheetName]);
            setContent(htmlStr);
          } catch (e) {
            setContent("Error parsing Excel file.");
          }
          setLoading(false);
        })
        .catch(() => {
          setContent("Error reading Excel data.");
          setLoading(false);
        });
    }
  }, [url, extension, isText, isExcel]);

  if (!url) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Right-click protection on the container */}
      <div 
        className="bg-card w-full max-w-6xl rounded-lg shadow-lg border border-border flex flex-col relative"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex flex-shrink-0 items-center justify-between p-4 border-b border-border relative z-20 bg-card rounded-t-lg">
          <h2 className="text-xl font-bold truncate">Viewing: {filename || "Document"}</h2>
          <div className="flex items-center gap-4">
            {isImage && (
              <button
                onClick={() => setIsImageZoomed(!isImageZoomed)}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors bg-secondary/50 hover:bg-secondary px-3 py-1 rounded-md"
              >
                {isImageZoomed ? "Zoom Out" : "Toggle Zoom"}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global UI Rule: parent container overflow-auto with fixed h-[80vh] */}
        <div className="relative bg-secondary overflow-auto w-full h-[80vh] flex flex-col">
          
          {loading && (
            <div className="flex flex-col flex-1 items-center justify-center h-full w-full gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-muted-foreground font-medium animate-pulse">JARVIS is decrypting...</p>
            </div>
          )}

          {!loading && isImage && (
             <div className="w-full min-h-full flex items-center justify-center p-4">
               <img 
                 src={url} 
                 alt={filename || "Secure Image"} 
                 className={`${isImageZoomed ? "max-w-none cursor-zoom-out" : "object-contain cursor-zoom-in"} select-none`}
                 style={isImageZoomed ? { maxWidth: "none", maxHeight: "none" } : { maxWidth: "100%", maxHeight: "100%" }}
                 onClick={() => setIsImageZoomed(!isImageZoomed)}
                 onDragStart={(e) => e.preventDefault()}
               />
             </div>
          )}

          {!loading && isText && (
             <pre className="w-full h-fit min-h-full p-6 text-green-500 bg-black font-mono text-sm whitespace-pre-wrap m-0">
               {content}
             </pre>
          )}

          {!loading && isExcel && (
             <div className="w-full h-fit min-h-full p-4 bg-background text-foreground">
               <style>{`
                 .excel-table-wrapper table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 0.875rem; }
                 .excel-table-wrapper td, .excel-table-wrapper th { border-bottom: 1px solid hsl(var(--border)); border-right: 1px solid hsl(var(--border)); padding: 0.5rem; }
                 /* Table Header Stickiness rule */
                 .excel-table-wrapper tr:first-child td, .excel-table-wrapper tr:first-child th { position: sticky; top: 0; background-color: #0f172a; color: #f8fafc; z-index: 10; font-weight: bold; border-top: 1px solid #1e293b; box-shadow: 0 1px 2px rgba(0,0,0,0.5); }
                 .excel-table-wrapper tr td:first-child, .excel-table-wrapper tr th:first-child { border-left: 1px solid hsl(var(--border)); }
               `}</style>
               <div className="excel-table-wrapper" dangerouslySetInnerHTML={{ __html: content }} />
             </div>
          )}

          {!loading && isPDF && (
             <div className="w-full h-full relative" style={{ minHeight: "80vh" }}>
               <div className="absolute inset-0 z-10 bg-transparent pointer-events-none" />
               <iframe
                 src={`${url}#toolbar=0&navpanes=0&scrollbar=0`}
                 style={{ width: "100%", height: "100%" }}
                 className="border-none absolute inset-0"
                 scrolling="yes"
                 title="Secure File Viewer"
               />
             </div>
          )}

          {!loading && !isImage && !isText && !isExcel && !isPDF && (
             <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
               <div className="bg-destructive/10 p-4 rounded-full mb-4">
                 <X className="w-8 h-8 text-destructive" />
               </div>
               <p className="text-lg font-semibold text-warning mb-2">
                 Preview not available for this format.
               </p>
               <p className="text-sm text-muted-foreground">
                 Access restricted by ZeroTrustGuard. Downloading is prohibited.
               </p>
             </div>
          )}
          
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Highlighter, 
  FileText,
  Bookmark,
  Trash2,
  Columns
} from 'lucide-react';
import type { Paper, Highlight } from '../types';

interface PdfReaderViewProps {
  paper: Paper;
  onClose: () => void;
  onUpdatePaper: (updated: Paper) => void;
}

export const PdfReaderView: React.FC<PdfReaderViewProps> = ({
  paper,
  onClose,
  onUpdatePaper,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.2);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [highlightMode, setHighlightMode] = useState<boolean>(false);
  const [activeColor, setActiveColor] = useState<string>('rgba(253, 224, 71, 0.4)'); // yellow highlight by default
  const [activeColorName, setActiveColorName] = useState<string>('yellow');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'bookmarks' | 'notes'>('bookmarks');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false); // default false for nested panels
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Highlight drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });

  const colors = [
    { name: 'yellow', value: 'rgba(253, 224, 71, 0.4)', text: 'bg-yellow-300' },
    { name: 'green', value: 'rgba(74, 222, 128, 0.4)', text: 'bg-green-400' },
    { name: 'blue', value: 'rgba(96, 165, 250, 0.4)', text: 'bg-blue-400' },
    { name: 'pink', value: 'rgba(244, 114, 182, 0.4)', text: 'bg-pink-400' }
  ];

  // 1. Load PDF Document
  useEffect(() => {
    setLoading(true);
    setPageNumber(paper.currentPage || 1);
    const pdfUrl = `./pdfs/${paper.id}.pdf`;
    
    // Clear old document state
    setPdfDoc(null);
    
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) {
      console.error("PDF.js library not loaded on window");
      return;
    }

    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    loadingTask.promise.then((pdf: any) => {
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setLoading(false);
      
      // Update paper metadata with actual page count
      if (!paper.pageCount || paper.pageCount !== pdf.numPages) {
        onUpdatePaper({
          ...paper,
          pageCount: pdf.numPages
        });
      }
    }).catch((err: any) => {
      console.error("Error loading PDF document", err);
      setLoading(false);
    });

    return () => {
      loadingTask.destroy();
    };
  }, [paper.id]);

  // 2. Render Page Canvas
  useEffect(() => {
    if (!pdfDoc) return;

    // Cancel previous render if it is running
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    pdfDoc.getPage(pageNumber).then((page: any) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      const viewport = page.getViewport({ scale: zoom });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      renderTask.promise.then(() => {
        renderTaskRef.current = null;
      }).catch((err: any) => {
        if (err.name !== 'RenderingCancelledException') {
          console.error("Error rendering page", err);
        }
      });
    });

    // Save reading progress to parent
    if (paper.currentPage !== pageNumber) {
      onUpdatePaper({
        ...paper,
        currentPage: pageNumber
      });
    }
  }, [pdfDoc, pageNumber, zoom]);

  // 3. Highlight drawing coordinates handling
  const getRelativeCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!highlightMode) return;
    setIsDrawing(true);
    const coords = getRelativeCoords(e);
    setStartPos(coords);
    setCurrentPos(coords);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    const coords = getRelativeCoords(e);
    setCurrentPos(coords);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    // Calculate dimensions
    const left = Math.min(startPos.x, currentPos.x);
    const top = Math.min(startPos.y, currentPos.y);
    const width = Math.abs(startPos.x - currentPos.x);
    const height = Math.abs(startPos.y - currentPos.y);

    // Filter out tiny accidental clicks (width/height threshold)
    if (width > 8 && height > 8 && canvasRef.current) {
      const canvasWidth = canvasRef.current.width;
      const canvasHeight = canvasRef.current.height;

      // Save coordinates as percentages of the canvas dimensions
      const pctLeft = (left / canvasWidth) * 100;
      const pctTop = (top / canvasHeight) * 100;
      const pctWidth = (width / canvasWidth) * 100;
      const pctHeight = (height / canvasHeight) * 100;

      const newHighlight: Highlight = {
        id: 'hl_' + Math.random().toString(36).substr(2, 9),
        page: pageNumber,
        text: `Highlight on Page ${pageNumber}`,
        color: activeColor,
        rects: [{ left: pctLeft, top: pctTop, width: pctWidth, height: pctHeight }],
        date: new Date().toISOString()
      };

      const existingHighlights = paper.highlights || [];
      onUpdatePaper({
        ...paper,
        highlights: [...existingHighlights, newHighlight],
        dateModified: new Date().toISOString()
      });
    }
  };

  const handleDeleteHighlight = (id: string) => {
    const updated = (paper.highlights || []).filter(h => h.id !== id);
    onUpdatePaper({
      ...paper,
      highlights: updated,
      dateModified: new Date().toISOString()
    });
  };

  const handleAddHighlightNote = (id: string, noteText: string) => {
    const updated = (paper.highlights || []).map(h => 
      h.id === id ? { ...h, text: noteText } : h
    );
    onUpdatePaper({
      ...paper,
      highlights: updated,
      dateModified: new Date().toISOString()
    });
  };

  const currentHighlights = (paper.highlights || []).filter(h => h.page === pageNumber);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 select-none text-slate-100 text-sm overflow-hidden w-full">
      {/* Top Reader Toolbar */}
      <div className="h-12 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-3 z-20 shrink-0 w-full">
        <div className="flex items-center gap-2">
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
            title="Close PDF Reader"
          >
            <X className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-1 rounded hover:bg-slate-800 transition-colors ${isSidebarOpen ? 'text-blue-400' : 'text-slate-400'}`}
            title="Toggle outline & annotations panel"
          >
            <Columns className="w-4 h-4" />
          </button>

          <div className="font-medium text-slate-200 max-w-[120px] sm:max-w-xs truncate" title={paper.title}>
            {paper.title}
          </div>
        </div>

        {/* Page Nav Controls */}
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setPageNumber(p => Math.max(1, p - 1))}
            disabled={pageNumber <= 1 || loading}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1 text-[11px]">
            <input 
              type="number"
              value={pageNumber}
              onChange={e => {
                const val = parseInt(e.target.value);
                if (val >= 1 && val <= numPages) setPageNumber(val);
              }}
              className="w-8 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center text-white focus:outline-none focus:border-blue-500 font-semibold"
              min={1}
              max={numPages}
            />
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{numPages || '...'}</span>
          </div>

          <button 
            onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages || loading}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom & Highlight Tools */}
        <div className="flex items-center gap-2">
          {/* Zoom */}
          <div className="flex items-center gap-1 border-r border-slate-800 pr-2">
            <button 
              onClick={() => setZoom(z => Math.max(0.6, z - 0.15))}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-slate-400 w-8 text-center hidden sm:inline-block">
              {Math.round(zoom * 100)}%
            </span>
            <button 
              onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Highlight Tool */}
          <div className="flex items-center gap-1.5">
            {/* Color Bubbles */}
            {highlightMode && (
              <div className="flex items-center gap-0.5 bg-slate-850 p-0.5 rounded-full border border-slate-800">
                {colors.map(c => (
                  <button 
                    key={c.name}
                    onClick={() => {
                      setActiveColor(c.value);
                      setActiveColorName(c.name);
                    }}
                    className={`w-2.5 h-2.5 rounded-full ${c.text} border transition-transform ${
                      activeColorName === c.name ? 'scale-110 border-white' : 'border-transparent'
                    }`}
                    title={`Highlight in ${c.name}`}
                  />
                ))}
              </div>
            )}
            
            <button 
              onClick={() => setHighlightMode(!highlightMode)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
                highlightMode 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Draw highlights on page"
            >
              <Highlighter className="w-3 h-3" />
              <span className="hidden md:inline">{highlightMode ? 'Active' : 'Highlight'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        {/* Left Outline/Bookmarks Sidebar */}
        {isSidebarOpen && (
          <div className="w-56 shrink-0 border-r border-slate-800 bg-slate-950 flex flex-col h-full z-15">
            <div className="flex border-b border-slate-800 bg-slate-900 text-xs text-slate-400 shrink-0">
              <button
                onClick={() => setActiveSidebarTab('bookmarks')}
                className={`flex-1 py-1.5 text-center border-b-2 font-medium capitalize flex items-center justify-center gap-1.5 ${
                  activeSidebarTab === 'bookmarks' 
                    ? 'border-blue-500 text-white bg-slate-950' 
                    : 'border-transparent hover:bg-slate-800'
                }`}
              >
                <Bookmark className="w-3 h-3" />
                <span>Highlights</span>
              </button>
              <button
                onClick={() => setActiveSidebarTab('notes')}
                className={`flex-1 py-1.5 text-center border-b-2 font-medium capitalize flex items-center justify-center gap-1.5 ${
                  activeSidebarTab === 'notes' 
                    ? 'border-blue-500 text-white bg-slate-950' 
                    : 'border-transparent hover:bg-slate-800'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>Notes</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {activeSidebarTab === 'bookmarks' && (
                (paper.highlights || []).length === 0 ? (
                  <div className="text-slate-500 text-[11px] italic text-center mt-6 p-2">
                    No highlights. Turn on highlighter and drag on page.
                  </div>
                ) : (
                  (paper.highlights || []).map(hl => (
                    <div key={hl.id} className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] uppercase font-bold text-slate-500">
                          Page {hl.page}
                        </span>
                        <button 
                          onClick={() => handleDeleteHighlight(hl.id)}
                          className="text-slate-500 hover:text-red-400"
                          title="Delete highlight"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      
                      <input 
                        type="text"
                        value={hl.text}
                        onChange={e => handleAddHighlightNote(hl.id, e.target.value)}
                        placeholder="Add comment..."
                        className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 text-[11px] focus:outline-none focus:border-blue-500"
                      />

                      <div className="flex gap-1.5 items-center justify-between mt-1">
                        <div className="w-3 h-3 rounded-full border border-slate-700" style={{ backgroundColor: hl.color }} />
                        <button 
                          onClick={() => setPageNumber(hl.page)}
                          className="text-blue-400 hover:text-blue-300 font-semibold hover:underline text-[9px]"
                        >
                          Go to page
                        </button>
                      </div>
                    </div>
                  ))
                )
              )}

              {activeSidebarTab === 'notes' && (
                paper.notes.length === 0 ? (
                  <div className="text-slate-500 text-[11px] italic text-center mt-6 p-2">No notes attached.</div>
                ) : (
                  paper.notes.map(note => (
                    <div key={note.id} className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs space-y-1">
                      <div className="font-semibold text-slate-350 truncate text-[11px]">{note.title || 'Untitled Note'}</div>
                      <div className="text-slate-400 font-mono text-[9px] leading-relaxed truncate">
                        {note.content || '(no content)'}
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        )}

        {/* Central PDF Display Area */}
        <div className="flex-1 overflow-auto bg-slate-800 flex justify-center p-3 relative min-w-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90 z-30">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-semibold text-slate-400">Loading PDF...</span>
              </div>
            </div>
          )}

          {/* Interactive Bounding Box Wrapper */}
          <div 
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`relative shadow-2xl h-fit border border-slate-700 bg-white ${
              highlightMode ? 'cursor-cell' : 'cursor-default'
            }`}
            style={{
              width: canvasRef.current ? `${canvasRef.current.width}px` : 'auto',
              height: canvasRef.current ? `${canvasRef.current.height}px` : 'auto',
            }}
          >
            {/* The Actual PDF Page Canvas */}
            <canvas ref={canvasRef} className="block" />

            {/* Render Saved Highlights */}
            {canvasRef.current && currentHighlights.map(hl => (
              hl.rects.map((rect, idx) => (
                <div 
                  key={`${hl.id}_${idx}`}
                  style={{
                    position: 'absolute',
                    left: `${rect.left}%`,
                    top: `${rect.top}%`,
                    width: `${rect.width}%`,
                    height: `${rect.height}%`,
                    backgroundColor: hl.color,
                    pointerEvents: 'none',
                    zIndex: 10
                  }}
                  title={hl.text}
                />
              ))
            ))}

            {/* Render Active Drawing Rectangle */}
            {isDrawing && canvasRef.current && (
              <div 
                style={{
                  position: 'absolute',
                  left: `${Math.min(startPos.x, currentPos.x)}px`,
                  top: `${Math.min(startPos.y, currentPos.y)}px`,
                  width: `${Math.abs(startPos.x - currentPos.x)}px`,
                  height: `${Math.abs(startPos.y - currentPos.y)}px`,
                  backgroundColor: activeColor,
                  border: '1px dashed white',
                  pointerEvents: 'none',
                  zIndex: 20
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

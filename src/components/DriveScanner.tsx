import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  CloudLightning,
  Sparkles,
  Inbox,
  FolderOpen,
  UploadCloud,
  Trash2,
  FileUp,
  HardDrive,
  Square,
  CheckSquare,
  Loader2,
  X,
  Image
} from 'lucide-react';
import { DriveFileItem, TravelBooking } from '../types';

interface DriveScannerProps {
  accessToken: string;
  bookings: TravelBooking[];
  onAnalyzeFile: (file: DriveFileItem) => Promise<void>;
  isAnalyzing: { [key: string]: boolean };
  onScanComplete: (files: DriveFileItem[]) => void;
  onAnalyzeLocalFile: (name: string, mimeType: string, base64Data: string, localId: string) => Promise<void>;
}

interface LocalFileItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  base64Data?: string;
  status: 'idle' | 'analyzing' | 'done' | 'failed';
  error?: string;
}

interface DuplicateConflict {
  file: File;
  existingId?: string;
  existingName: string;
  type: 'queue' | 'booking';
}

export default function DriveScanner({ 
  accessToken, 
  bookings, 
  onAnalyzeFile, 
  isAnalyzing,
  onScanComplete,
  onAnalyzeLocalFile
}: DriveScannerProps) {
  // Tabs
  const [activeTab, setActiveTab] = useState<'drive' | 'photos' | 'local'>('drive');

  // Google Drive states
  const [searchQuery, setSearchQuery] = useState('');
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [selectedDriveFileIds, setSelectedDriveFileIds] = useState<string[]>([]);
  const [isBatchAnalyzingDrive, setIsBatchAnalyzingDrive] = useState(false);

  // Google Photos states
  const [photosSearchQuery, setPhotosSearchQuery] = useState('');
  const [photoFiles, setPhotoFiles] = useState<DriveFileItem[]>([]);
  const [isPhotosLoading, setIsPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [hasScannedPhotos, setHasScannedPhotos] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [isBatchAnalyzingPhotos, setIsBatchAnalyzingPhotos] = useState(false);

  // HEIC conversion loading state
  const [isConvertingHeic, setIsConvertingHeic] = useState(false);

  // Local File states
  const [localFiles, setLocalFiles] = useState<LocalFileItem[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingConflicts, setPendingConflicts] = useState<DuplicateConflict[]>([]);
  const currentConflict = pendingConflicts[0];

  const isFileProcessed = (fileId: string) => {
    return bookings.some(b => b.id === fileId && b.isTravelDocument);
  };

  // Pre-select new files automatically on results update
  useEffect(() => {
    const unanalyzed = driveFiles.filter(f => !isFileProcessed(f.id)).map(f => f.id);
    setSelectedDriveFileIds(unanalyzed);
  }, [driveFiles, bookings]);

  // Pre-select new photos automatically on results update
  useEffect(() => {
    const unanalyzed = photoFiles.filter(f => !isFileProcessed(f.id)).map(f => f.id);
    setSelectedPhotoIds(unanalyzed);
  }, [photoFiles, bookings]);

  // Google Photos: Scan recent photos or resolve pasted URL
  const handleScanPhotos = async () => {
    setIsPhotosLoading(true);
    setPhotosError(null);
    try {
      const trimmed = photosSearchQuery.trim();
      if (trimmed.includes('photos.app.goo.gl') || trimmed.includes('photos.google.com') || trimmed.includes('googleusercontent.com') || trimmed.includes('drive.google.com')) {
        const resolvedPhoto = await resolveAndSetPhoto(trimmed);
        setPhotoFiles(prev => {
          const exists = prev.some(p => p.baseUrl === resolvedPhoto.baseUrl || p.webViewLink === resolvedPhoto.webViewLink);
          return exists ? prev : [resolvedPhoto, ...prev];
        });
        setHasScannedPhotos(true);
        return;
      }

      const url = `https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=40`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 403) {
        throw new Error('No se pudo acceder a la biblioteca privada de Google Fotos mediante la API directa. ¡Pero puedes analizar cualquier foto o álbum compartido de Google Fotos! Pega la URL del enlace compartido en la casilla de búsqueda arriba y presiona Buscar.');
      }
      if (!response.ok) {
        throw new Error('No se pudo acceder a la biblioteca de Google Fotos. Pega el enlace de tu foto compartida en la casilla de búsqueda para importar tu foto directamente.');
      }

      const data = await response.json();
      const items = data.mediaItems || [];
      
      const mappedItems: DriveFileItem[] = items.map((item: any) => ({
        id: item.id,
        name: item.filename || 'Foto de Viaje.jpg',
        mimeType: item.mimeType || 'image/jpeg',
        webViewLink: item.productUrl,
        iconLink: item.baseUrl, // Base url used as thumbnail
        modifiedTime: item.mediaMetadata?.creationTime,
        source: 'photos',
        baseUrl: item.baseUrl
      }));

      setPhotoFiles(mappedItems);
      setHasScannedPhotos(true);
    } catch (err: any) {
      console.error(err);
      setPhotosError(err.message || 'No se pudo completar la búsqueda en Google Fotos.');
    } finally {
      setIsPhotosLoading(false);
    }
  };

  const handleAnalyzePhotoSingle = async (photo: DriveFileItem) => {
    await onAnalyzeFile(photo);
  };

  const handleAnalyzeSelectedPhotos = async () => {
    const filesToAnalyze = photoFiles.filter(f => selectedPhotoIds.includes(f.id) && !isFileProcessed(f.id));
    if (filesToAnalyze.length === 0) return;

    setIsBatchAnalyzingPhotos(true);
    try {
      for (const file of filesToAnalyze) {
        await onAnalyzeFile(file);
        // Wait 600ms to reduce rate limit pressure
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      setSelectedPhotoIds([]);
    } catch (err) {
      console.error('Batch photos analysis error:', err);
    } finally {
      setIsBatchAnalyzingPhotos(false);
    }
  };

  // Google Drive: Broad auto-scan
  const handleAutoScan = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const terms = [
        "hotel", "vuelo", "reserva", "alquiler", "rental", "ticket", 
        "boarding", "boardingpass", "booking", "viaje", "trip", 
        "flight", "itinerary", "itinerario", "confirmacion", 
        "confirmation", "hospedaje", "alojamiento", "actividad", "activity"
      ];
      
      const q = `trashed = false and (${terms.map(t => `name contains '${t}'`).join(' or ')})`;
      const url = `https://www.googleapis.com/drive/v3/files?pageSize=50&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime)&q=${encodeURIComponent(q)}`;
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error('Error al obtener archivos de Google Drive');
      }

      const data = await response.json();
      const files: DriveFileItem[] = data.files || [];
      setDriveFiles(files);
      onScanComplete(files);
      setHasScanned(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudo completar la búsqueda automática.');
    } finally {
      setIsLoading(false);
    }
  };

  const resolveAndSetPhoto = async (link: string) => {
    const res = await fetch('/api/resolve-photo-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ link })
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'No se pudo resolver el enlace de Google Fotos.');
    }

    const resolvedItem = await res.json();
    return resolvedItem;
  };

  // Google Drive: Custom name or URL search
  const handleCustomSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const trimmed = searchQuery.trim();

      // Check if it's a Google Photos Link first
      if (trimmed.includes('photos.app.goo.gl') || trimmed.includes('photos.google.com') || trimmed.includes('googleusercontent.com')) {
        const resolvedPhoto = await resolveAndSetPhoto(trimmed);
        setDriveFiles([resolvedPhoto]);
        setHasScanned(true);
        return;
      }

      const extractFileId = (input: string) => {
        const fileDMatch = input.match(/\/file\/d\/([a-zA-Z0-9_-]{25,110})/);
        if (fileDMatch) return fileDMatch[1];
        
        const idParamMatch = input.match(/[\?&]id=([a-zA-Z0-9_-]{25,110})/);
        if (idParamMatch) return idParamMatch[1];
        
        const trimmedVal = input.trim();
        if (/^[a-zA-Z0-9_-]{25,110}$/.test(trimmedVal)) {
          return trimmedVal;
        }
        return null;
      };

      const fileId = extractFileId(trimmed);

      if (fileId) {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink,iconLink,modifiedTime`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          throw new Error('No se pudo acceder a este archivo de Google Drive. Verifica que tengas permisos para verlo.');
        }

        const file = await response.json();
        setDriveFiles([file]);
      } else {
        const q = `trashed = false and name contains '${trimmed.replace(/'/g, "\\'")}'`;
        const url = `https://www.googleapis.com/drive/v3/files?pageSize=30&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime)&q=${encodeURIComponent(q)}`;
        
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          throw new Error('Error al buscar archivos en Google Drive');
        }

        const data = await response.json();
        setDriveFiles(data.files || []);
      }
      setHasScanned(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error en la búsqueda.');
    } finally {
      setIsLoading(false);
    }
  };

  // Google Photos: Custom name or URL search
  const handlePhotosCustomSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photosSearchQuery.trim()) return;

    setIsPhotosLoading(true);
    setPhotosError(null);
    try {
      const trimmed = photosSearchQuery.trim();

      if (trimmed.includes('photos.app.goo.gl') || trimmed.includes('photos.google.com') || trimmed.includes('googleusercontent.com')) {
        const resolvedPhoto = await resolveAndSetPhoto(trimmed);
        setPhotoFiles([resolvedPhoto]);
        setHasScannedPhotos(true);
      } else {
        // Text search: fetch recents if we haven't already and filter client side
        let basePhotos = photoFiles;
        if (!hasScannedPhotos || basePhotos.length === 0) {
          const url = `https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=50`;
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          
          if (!response.ok) {
            throw new Error('No se pudo buscar en tu biblioteca de Google Fotos.');
          }

          const data = await response.json();
          const items = data.mediaItems || [];
          basePhotos = items.map((item: any) => ({
            id: item.id,
            name: item.filename || 'Foto de Viaje.jpg',
            mimeType: item.mimeType || 'image/jpeg',
            webViewLink: item.productUrl,
            iconLink: item.baseUrl,
            modifiedTime: item.mediaMetadata?.creationTime,
            source: 'photos',
            baseUrl: item.baseUrl
          }));
          setPhotoFiles(basePhotos);
          setHasScannedPhotos(true);
        }

        const filtered = basePhotos.filter(p => p.name.toLowerCase().includes(trimmed.toLowerCase()));
        setPhotoFiles(filtered);
      }
    } catch (err: any) {
      console.error(err);
      setPhotosError(err.message || 'Error en la búsqueda de fotos.');
    } finally {
      setIsPhotosLoading(false);
    }
  };

  // Toggle selection for single file
  const toggleSelectDriveFile = (id: string) => {
    setSelectedDriveFileIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Toggle select all unanalyzed
  const handleToggleSelectAll = () => {
    const pendingFiles = driveFiles.filter(f => !isFileProcessed(f.id));
    if (selectedDriveFileIds.length === pendingFiles.length) {
      setSelectedDriveFileIds([]);
    } else {
      setSelectedDriveFileIds(pendingFiles.map(f => f.id));
    }
  };

  // Toggle selection for single photo
  const toggleSelectPhotoFile = (id: string) => {
    setSelectedPhotoIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Toggle select all unanalyzed photos
  const handleToggleSelectAllPhotos = () => {
    const pendingPhotos = photoFiles.filter(f => !isFileProcessed(f.id));
    if (selectedPhotoIds.length === pendingPhotos.length) {
      setSelectedPhotoIds([]);
    } else {
      setSelectedPhotoIds(pendingPhotos.map(f => f.id));
    }
  };

  // Batch analyze selected Google Drive files sequentially to respect rate limits
  const handleAnalyzeSelectedDrive = async () => {
    const filesToAnalyze = driveFiles.filter(f => selectedDriveFileIds.includes(f.id) && !isFileProcessed(f.id));
    if (filesToAnalyze.length === 0) return;

    setIsBatchAnalyzingDrive(true);
    try {
      // Process files one by one with a small gap to minimize quota pressure
      for (const file of filesToAnalyze) {
        await onAnalyzeFile(file);
        // Wait 600ms before processing next file
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      setSelectedDriveFileIds([]);
    } catch (err) {
      console.error('Batch analysis error:', err);
    } finally {
      setIsBatchAnalyzingDrive(false);
    }
  };

  // LOCAL UPLOAD FUNCTIONS
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processLocalFilesWithHeic(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processLocalFilesWithHeic(e.target.files);
    }
  };

  const processLocalFilesWithHeic = async (files: FileList | File[]) => {
    setIsConvertingHeic(true);
    const processedFiles: File[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const isHeic = f.name.toLowerCase().endsWith('.heic') || 
                       f.name.toLowerCase().endsWith('.heif') || 
                       f.type === 'image/heic' || 
                       f.type === 'image/heif';
        
        if (isHeic) {
          try {
            // @ts-ignore
            const heic2anyModule = await import('heic2any');
            const heic2any = heic2anyModule.default;
            const converted = await heic2any({
              blob: f,
              toType: 'image/jpeg',
              quality: 0.8
            });
            const blob = Array.isArray(converted) ? converted[0] : converted;
            const newName = f.name.replace(/\.(heic|heif)$/i, '.jpg');
            const convertedFile = new File([blob], newName, { type: 'image/jpeg' });
            processedFiles.push(convertedFile);
          } catch (err) {
            console.error('HEIC conversion failed:', err);
            processedFiles.push(f); // Fallback to original
          }
        } else {
          processedFiles.push(f);
        }
      }
    } catch (err) {
      console.error('Error pre-processing files:', err);
      for (let i = 0; i < files.length; i++) {
        processedFiles.push(files[i]);
      }
    } finally {
      setIsConvertingHeic(false);
    }
    
    runProcessLocalFiles(processedFiles);
  };

  const getUniqueLocalName = (name: string) => {
    const extIndex = name.lastIndexOf('.');
    const base = extIndex !== -1 ? name.substring(0, extIndex) : name;
    const ext = extIndex !== -1 ? name.substring(extIndex) : '';
    
    let counter = 1;
    let newName = `${base} (${counter})${ext}`;
    while (
      localFiles.some(lf => lf.name === newName) ||
      bookings.some(b => b.fileName === newName && b.isTravelDocument)
    ) {
      counter++;
      newName = `${base} (${counter})${ext}`;
    }
    return newName;
  };

  const addFilesToQueue = (files: File[], customNames?: { [fileName: string]: string }) => {
    const newFiles: LocalFileItem[] = [];
    for (const f of files) {
      const localId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const displayName = customNames && customNames[f.name] ? customNames[f.name] : f.name;
      
      const item: LocalFileItem = {
        id: localId,
        name: displayName,
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
        status: 'idle'
      };

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setLocalFiles(prev => prev.map(it => it.id === localId ? { ...item, base64Data: base64 } : it));
      };
      reader.readAsDataURL(f);

      newFiles.push(item);
    }
    setLocalFiles(prev => [...prev, ...newFiles]);
  };

  const resolveConflict = (action: 'overwrite' | 'keep_both' | 'skip') => {
    if (pendingConflicts.length === 0) return;
    const current = pendingConflicts[0];

    if (action === 'overwrite') {
      if (current.type === 'queue' && current.existingId) {
        setLocalFiles(prev => prev.filter(f => f.id !== current.existingId));
      }
      addFilesToQueue([current.file]);
    } else if (action === 'keep_both') {
      const uniqueName = getUniqueLocalName(current.file.name);
      addFilesToQueue([current.file], { [current.file.name]: uniqueName });
    } else if (action === 'skip') {
      // Do nothing
    }

    setPendingConflicts(prev => prev.slice(1));
  };

  const runProcessLocalFiles = (files: File[] | FileList) => {
    const conflicts: DuplicateConflict[] = [];
    const readyFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const inQueue = localFiles.find(lf => lf.name === f.name);
      const inBookings = bookings.find(b => b.fileName === f.name && b.isTravelDocument);

      if (inQueue) {
        conflicts.push({
          file: f,
          existingId: inQueue.id,
          existingName: inQueue.name,
          type: 'queue'
        });
      } else if (inBookings) {
        conflicts.push({
          file: f,
          existingId: inBookings.id,
          existingName: inBookings.fileName,
          type: 'booking'
        });
      } else {
        readyFiles.push(f);
      }
    }

    if (readyFiles.length > 0) {
      addFilesToQueue(readyFiles);
    }

    if (conflicts.length > 0) {
      setPendingConflicts(prev => [...prev, ...conflicts]);
    }
  };

  // Analyze single local file
  const handleAnalyzeLocalSingle = async (lf: LocalFileItem) => {
    if (!lf.base64Data) return;
    setLocalFiles(prev => prev.map(item => item.id === lf.id ? { ...item, status: 'analyzing' } : item));
    try {
      await onAnalyzeLocalFile(lf.name, lf.mimeType, lf.base64Data, lf.id);
      setLocalFiles(prev => prev.map(item => item.id === lf.id ? { ...item, status: 'done' } : item));
    } catch (err: any) {
      console.error(err);
      setLocalFiles(prev => prev.map(item => item.id === lf.id ? { ...item, status: 'failed', error: err.message } : item));
    }
  };

  // Batch analyze all idle local files sequentially to respect rate limits
  const handleAnalyzeAllLocal = async () => {
    const idleFiles = localFiles.filter(lf => lf.status === 'idle' || lf.status === 'failed');
    if (idleFiles.length === 0) return;

    // Run local analyses sequentially with a small gap!
    for (const lf of idleFiles) {
      let base64 = lf.base64Data;
      if (!base64) continue;

      setLocalFiles(prev => prev.map(item => item.id === lf.id ? { ...item, status: 'analyzing' } : item));
      try {
        await onAnalyzeLocalFile(lf.name, lf.mimeType, base64, lf.id);
        setLocalFiles(prev => prev.map(item => item.id === lf.id ? { ...item, status: 'done' } : item));
      } catch (err: any) {
        console.error(err);
        setLocalFiles(prev => prev.map(item => item.id === lf.id ? { ...item, status: 'failed', error: err.message } : item));
      }

      // Wait 600ms between files
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  };

  const removeLocalFile = (id: string) => {
    setLocalFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearLocalQueue = () => {
    setLocalFiles([]);
  };

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const pendingDriveCount = driveFiles.filter(f => !isFileProcessed(f.id) && selectedDriveFileIds.includes(f.id)).length;
  const pendingPhotosCount = photoFiles.filter(f => !isFileProcessed(f.id) && selectedPhotoIds.includes(f.id)).length;
  const idleLocalCount = localFiles.filter(lf => lf.status === 'idle' || lf.status === 'failed').length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 flex flex-col h-[580px] shadow-sm overflow-hidden" id="drive-scanner-panel">
      {/* Tab Selectors */}
      <div className="flex border-b border-slate-100 bg-slate-50/70 p-1 shrink-0">
        <button
          onClick={() => setActiveTab('drive')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'drive' 
              ? 'bg-white text-indigo-700 shadow-sm border border-slate-100' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <HardDrive className="w-4 h-4 text-indigo-600" />
          <span>Escanear Google Drive</span>
        </button>
        <button
          onClick={() => setActiveTab('photos')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'photos' 
              ? 'bg-white text-indigo-700 shadow-sm border border-slate-100' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Image className="w-4 h-4 text-indigo-600" />
          <span>Escanear Google Fotos</span>
        </button>
        <button
          onClick={() => setActiveTab('local')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'local' 
              ? 'bg-white text-indigo-700 shadow-sm border border-slate-100' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileUp className="w-4 h-4 text-indigo-600" />
          <span>Subir desde mi PC</span>
        </button>
      </div>

      {activeTab === 'drive' && (
        // GOOGLE DRIVE SCANNING PANEL
        <div className="p-4 flex flex-col flex-1 min-h-0">
          <div className="mb-4 shrink-0">
            <h3 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-indigo-600" />
              Búsqueda Inteligente en Drive
            </h3>
            <p className="text-[11px] text-slate-500 leading-normal">
              Escaneará reservas, vuelos, vouchers y hoteles que estén guardados en tu espacio personal de Google Drive.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <button
                onClick={handleAutoScan}
                disabled={isLoading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-semibold text-xs rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Escaneo Inteligente</span>
              </button>

              <form onSubmit={handleCustomSearch} className="flex-[1.5] flex gap-1.5 border border-slate-200 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/10 rounded-xl p-1 transition-all bg-white">
                <input
                  type="text"
                  placeholder="Buscar por nombre o pegar link de Drive..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 text-xs outline-none px-2 text-slate-800 bg-transparent"
                />
                <button
                  type="submit"
                  disabled={isLoading || !searchQuery.trim()}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-3 bg-rose-50 border border-rose-100 rounded-xl p-3 text-rose-700 flex items-start gap-2 text-xs shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Scanned Files Area */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl bg-slate-50/50 min-h-0 flex flex-col">
            {!hasScanned && !isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center">
                  <CloudLightning className="w-5 h-5 text-indigo-500 animate-pulse" />
                </div>
                <div>
                  <p className="font-bold text-slate-700 text-xs">Escaneo Inicial Requerido</p>
                  <p className="text-[10px] text-slate-400 max-w-xs mt-0.5 leading-normal">
                    Haz clic en "Escaneo Inteligente" o busca palabras clave para importar tus archivos de viaje.
                  </p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-3">
                <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
                <p className="text-xs text-slate-500 font-semibold">Leyendo tu Google Drive...</p>
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
                <Inbox className="w-6 h-6 text-slate-300" />
                <p className="text-xs text-slate-500 font-semibold">No se encontraron archivos.</p>
                <p className="text-[10px] text-slate-400 max-w-xs leading-normal">Intenta buscar palabras clave como "vuelo", "hotel" o "reserva" usando el buscador manual.</p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">
                {/* Batch Control Header */}
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 mb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleToggleSelectAll}
                      className="text-slate-500 hover:text-slate-800 transition-colors"
                      title="Seleccionar / deseleccionar todos los nuevos"
                    >
                      {driveFiles.filter(f => !isFileProcessed(f.id)).length > 0 && selectedDriveFileIds.length === driveFiles.filter(f => !isFileProcessed(f.id)).length ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Resultados ({driveFiles.length})
                    </span>
                  </div>

                  {pendingDriveCount > 0 && (
                    <button
                      onClick={handleAnalyzeSelectedDrive}
                      disabled={isBatchAnalyzingDrive}
                      className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      {isBatchAnalyzingDrive ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>Analizar {pendingDriveCount} seleccionados en simultáneo</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {driveFiles.map((file) => {
                    const processed = isFileProcessed(file.id);
                    const analyzing = isAnalyzing[file.id];
                    const isSelected = selectedDriveFileIds.includes(file.id);

                    return (
                      <div 
                        key={file.id}
                        className={`flex items-center justify-between gap-3 p-2 rounded-xl border transition-all ${
                          isSelected && !processed ? 'border-indigo-200 bg-indigo-50/20' : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Multi select checkbox */}
                          {!processed ? (
                            <button
                              onClick={() => toggleSelectDriveFile(file.id)}
                              disabled={analyzing}
                              className="text-slate-400 hover:text-indigo-600 transition-colors px-1 shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-indigo-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />
                              )}
                            </button>
                          ) : (
                            <div className="w-4 shrink-0" />
                          )}

                          <div className="w-7 h-7 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                            {file.iconLink ? (
                              <img src={file.iconLink} alt="" className="w-4 h-4" referrerPolicy="no-referrer" />
                            ) : (
                              <FileText className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-700 truncate" title={file.name}>
                              {file.name}
                            </p>
                            <p className="text-[9px] text-slate-400 truncate font-mono uppercase">
                              {file.mimeType.split('/').pop()?.toUpperCase()} • {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString('es-ES') : ''}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {processed ? (
                            <div className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-xl font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-[10px]">Listo</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => onAnalyzeFile(file)}
                              disabled={analyzing || isBatchAnalyzingDrive}
                              className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:bg-slate-50 disabled:text-slate-400 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors cursor-pointer animate-fade-in"
                            >
                              {analyzing ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin text-indigo-700" />
                                  <span>Procesando...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3 text-indigo-600" />
                                  <span>Analizar</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'photos' && (
        // GOOGLE PHOTOS SCANNING PANEL
        <div className="p-4 flex flex-col flex-1 min-h-0">
          <div className="mb-4 shrink-0">
            <h3 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2">
              <Image className="w-4 h-4 text-indigo-600" />
              Búsqueda Inteligente en Fotos
            </h3>
            <p className="text-[11px] text-slate-500 leading-normal">
              Escaneará reservas, capturas de pantalla, boletos, vouchers y hoteles que estén guardados en tu espacio de Google Fotos.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <button
                onClick={handleScanPhotos}
                disabled={isPhotosLoading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-semibold text-xs rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPhotosLoading ? 'animate-spin' : ''}`} />
                <span>Escanear Fotos Recientes</span>
              </button>

              <form onSubmit={handlePhotosCustomSearch} className="flex-[1.5] flex gap-1.5 border border-slate-200 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/10 rounded-xl p-1 transition-all bg-white">
                <input
                  type="text"
                  placeholder="Buscar por nombre o pegar link de Google Fotos..."
                  value={photosSearchQuery}
                  onChange={(e) => setPhotosSearchQuery(e.target.value)}
                  className="flex-1 text-xs outline-none px-2 text-slate-800 bg-transparent"
                />
                <button
                  type="submit"
                  disabled={isPhotosLoading || !photosSearchQuery.trim()}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {photosSearchQuery.trim().includes('photos.app.goo.gl') || photosSearchQuery.trim().includes('photos.google.com') ? (
              <motion.div 
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2.5 p-2 bg-indigo-50/80 border border-indigo-200/60 rounded-xl flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 text-xs text-indigo-900 font-medium min-w-0">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="truncate">Enlace de Google Fotos detectado:</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => handlePhotosCustomSearch(e)}
                  disabled={isPhotosLoading}
                  className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] px-3 py-1 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1"
                >
                  {isPhotosLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                  <span>Importar Foto</span>
                </button>
              </motion.div>
            ) : (
              <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                <span>💡 Pega cualquier enlace compartido de Google Fotos (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600 font-mono">https://photos.app.goo.gl/...</code>) para importar tus imágenes sin permisos adicionales.</span>
              </p>
            )}
          </div>

          {/* Error Alert */}
          {photosError && (
            <div className="mb-3 bg-rose-50 border border-rose-100 rounded-xl p-3 text-rose-700 flex items-start gap-2 text-xs shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{photosError}</span>
            </div>
          )}

          {/* Scanned Photos Area */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl bg-slate-50/50 min-h-0 flex flex-col">
            {!hasScannedPhotos && !isPhotosLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center">
                  <Image className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <p className="font-bold text-slate-700 text-xs">Escaneo Inicial de Fotos Requerido</p>
                  <p className="text-[10px] text-slate-400 max-w-xs mt-0.5 leading-normal">
                    Haz clic en "Escanear Fotos Recientes" o pega un enlace compartido para importar tus fotos de viaje.
                  </p>
                </div>
              </div>
            ) : isPhotosLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-3">
                <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
                <p className="text-xs text-slate-500 font-semibold">Leyendo tu Google Fotos...</p>
              </div>
            ) : photoFiles.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
                <Inbox className="w-6 h-6 text-slate-300" />
                <p className="text-xs text-slate-500 font-semibold">No se encontraron fotos.</p>
                <p className="text-[10px] text-slate-400 max-w-xs leading-normal">Intenta buscar o pegar un enlace compartido de Google Fotos.</p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">
                {/* Batch Control Header */}
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 mb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleToggleSelectAllPhotos}
                      className="text-slate-500 hover:text-slate-800 transition-colors"
                      title="Seleccionar / deseleccionar todos los nuevos"
                    >
                      {photoFiles.filter(f => !isFileProcessed(f.id)).length > 0 && selectedPhotoIds.length === photoFiles.filter(f => !isFileProcessed(f.id)).length ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Resultados ({photoFiles.length})
                    </span>
                  </div>

                  {pendingPhotosCount > 0 && (
                    <button
                      onClick={handleAnalyzeSelectedPhotos}
                      disabled={isBatchAnalyzingPhotos}
                      className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      {isBatchAnalyzingPhotos ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>Analizar {pendingPhotosCount} seleccionados en simultáneo</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {photoFiles.map((file) => {
                    const processed = isFileProcessed(file.id);
                    const analyzing = isAnalyzing[file.id];
                    const isSelected = selectedPhotoIds.includes(file.id);

                    return (
                      <div 
                        key={file.id}
                        className={`flex items-center justify-between gap-3 p-2 rounded-xl border transition-all ${
                          isSelected && !processed ? 'border-indigo-200 bg-indigo-50/20' : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Multi select checkbox */}
                          {!processed ? (
                            <button
                              onClick={() => toggleSelectPhotoFile(file.id)}
                              disabled={analyzing}
                              className="text-slate-400 hover:text-indigo-600 transition-colors px-1 shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-indigo-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />
                              )}
                            </button>
                          ) : (
                            <div className="w-4 shrink-0" />
                          )}

                          <div className="w-7 h-7 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                            {file.iconLink ? (
                              <img src={file.iconLink} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Image className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-700 truncate" title={file.name}>
                              {file.name}
                            </p>
                            <p className="text-[9px] text-slate-400 truncate font-mono uppercase">
                              {file.mimeType.split('/').pop()?.toUpperCase()} • {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString('es-ES') : ''}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {processed ? (
                            <div className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-xl font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-[10px]">Listo</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleAnalyzePhotoSingle(file)}
                              disabled={analyzing || isBatchAnalyzingPhotos}
                              className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:bg-slate-50 disabled:text-slate-400 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors cursor-pointer animate-fade-in"
                            >
                              {analyzing ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin text-indigo-700" />
                                  <span>Procesando...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3 text-indigo-600" />
                                  <span>Analizar</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'local' && (
        // LOCAL COMPUTER FILE UPLOAD PANEL
        <div className="p-4 flex flex-col flex-1 min-h-0">
          <div className="mb-3 shrink-0">
            <h3 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-indigo-600" />
              Subir Archivos desde tu Ordenador
            </h3>
            <p className="text-[11px] text-slate-500 leading-normal">
              Arrastra o selecciona capturas de pantalla, imágenes (JPG, PNG), PDFs o archivos de texto de tus reservas. ¡Se analizarán de forma segura usando IA!
            </p>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer shrink-0 ${
              isDragActive 
                ? 'border-indigo-500 bg-indigo-50/40 scale-[0.99]' 
                : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-white'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.heic,.heif,application/pdf,text/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-9 h-9 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
              {isConvertingHeic ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <UploadCloud className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700">
                {isConvertingHeic ? 'Convirtiendo imágenes HEIC...' : 'Arrastra tus archivos aquí o haz clic para explorar'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Soporta PNG, JPEG, HEIC, PDF, Capturas de Pantalla y Texto</p>
            </div>
          </div>

          {/* Local files queue header */}
          {localFiles.length > 0 && (
            <div className="flex items-center justify-between mt-3 mb-2 px-1 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cola de Subida ({localFiles.length})</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearLocalQueue}
                  className="text-[10px] font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Vaciar</span>
                </button>

                {idleLocalCount > 0 && (
                  <button
                    onClick={handleAnalyzeAllLocal}
                    className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Analizar todos en cola ({idleLocalCount})</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Queue List Area */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl bg-slate-50/50 min-h-0">
            {localFiles.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 text-xs">
                <Inbox className="w-7 h-7 mb-2 text-slate-300" />
                No hay archivos seleccionados.
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {localFiles.map((file) => {
                  const isAnalyzing = file.status === 'analyzing';
                  const isDone = file.status === 'done';
                  const isFailed = file.status === 'failed';

                  return (
                    <div 
                      key={file.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-all shadow-sm"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-7 h-7 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-700 truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[9px] text-slate-400 font-mono">
                            {formatBytes(file.size)} • {file.mimeType.split('/').pop()?.toUpperCase()}
                          </p>
                        </div>
                      </div>

                      {/* Status / Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isDone ? (
                          <div className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-xl font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Listo</span>
                          </div>
                        ) : isFailed ? (
                          <div className="flex items-center gap-1 text-[10px] text-rose-700 bg-rose-50 border border-rose-100 px-2 py-1 rounded-xl font-bold" title={file.error}>
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                            <span>Error</span>
                          </div>
                        ) : isAnalyzing ? (
                          <div className="flex items-center gap-1.5 text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-xl font-bold">
                            <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                            <span>Procesando...</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAnalyzeLocalSingle(file)}
                            disabled={!file.base64Data}
                            className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Analizar</span>
                          </button>
                        )}

                        {!isAnalyzing && (
                          <button
                            onClick={() => removeLocalFile(file.id)}
                            className="p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar de la lista"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Duplicate File Conflict Dialog */}
      <AnimatePresence>
        {pendingConflicts.length > 0 && currentConflict && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="w-full max-w-md overflow-hidden bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 bg-amber-50/50 flex items-start gap-3.5">
                <div className="w-10 h-10 bg-amber-100 border border-amber-200 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                  <AlertCircle className="w-5.5 h-5.5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Archivo duplicado detectado
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ya existe un archivo con este nombre en tu aplicación.
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-4.5 h-4.5 text-indigo-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 truncate" title={currentConflict.file.name}>
                      {currentConflict.file.name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {formatBytes(currentConflict.file.size)} • {currentConflict.file.type.split('/').pop()?.toUpperCase() || 'DOCUMENTO'}
                    </p>
                  </div>
                </div>

                <div className="text-xs text-slate-600 leading-relaxed bg-slate-50/50 p-3.5 rounded-xl border border-slate-100/80">
                  {currentConflict.type === 'queue' ? (
                    <span>
                      Este archivo ya se encuentra en tu <strong>cola de subida</strong>. ¿Qué te gustaría hacer?
                    </span>
                  ) : (
                    <span>
                      Este archivo ya ha sido <strong>analizado y guardado</strong> en tus reservas de viaje. ¿Qué deseas hacer?
                    </span>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => resolveConflict('skip')}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer text-center"
                >
                  Omitir
                </button>
                <button
                  type="button"
                  onClick={() => resolveConflict('keep_both')}
                  className="px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all cursor-pointer text-center"
                >
                  Conservar ambos
                </button>
                <button
                  type="button"
                  onClick={() => resolveConflict('overwrite')}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm shadow-indigo-200 hover:shadow-indigo-300 cursor-pointer text-center"
                >
                  Sobrescribir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

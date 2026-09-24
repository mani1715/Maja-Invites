import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Archive, Send, EyeOff, X, Download, ArchiveRestore } from 'lucide-react';

/**
 * BulkActionBar — appears floating at the bottom when ≥1 card is selected.
 * Actions are wired by the parent (LuxuryDashboard).
 */
const BulkActionBar = ({
  selectedCount,
  onClear,
  onDelete,
  onPublish,
  onUnpublish,
  onArchive,
  onUnarchive,
  onExportCsv,
  context, // 'all' | 'trash' | 'archived'
}) => (
  <AnimatePresence>
    {selectedCount > 0 && (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.28 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-3 rounded-full"
        style={{
          background: 'rgba(14,10,6,0.96)',
          border: '1px solid var(--lux-border-strong)',
          boxShadow: '0 24px 60px -20px rgba(0,0,0,0.65)',
          maxWidth: '95vw',
        }}
        data-testid="bulk-action-bar"
      >
        <span className="text-xs px-2 tracking-widest uppercase" style={{ color: 'rgba(255,248,220,0.85)' }}
          data-testid="bulk-action-count">
          {selectedCount} selected
        </span>
        <span className="w-px h-5" style={{ background: 'var(--lux-border)' }} />

        {context === 'trash' ? (
          <>
            <BulkBtn onClick={onUnarchive} icon={ArchiveRestore} label="Restore" testid="bulk-restore" />
            <BulkBtn onClick={onDelete}    icon={Trash2}         label="Delete forever" destructive testid="bulk-purge" />
          </>
        ) : (
          <>
            <BulkBtn onClick={onPublish}   icon={Send}    label="Publish"   testid="bulk-publish" />
            <BulkBtn onClick={onUnpublish} icon={EyeOff}  label="Unpublish" testid="bulk-unpublish" />
            {context === 'archived' ? (
              <BulkBtn onClick={onUnarchive} icon={ArchiveRestore} label="Unarchive" testid="bulk-unarchive" />
            ) : (
              <BulkBtn onClick={onArchive} icon={Archive} label="Archive" testid="bulk-archive" />
            )}
            <BulkBtn onClick={onExportCsv} icon={Download} label="Export CSV" testid="bulk-export" />
            <BulkBtn onClick={onDelete}    icon={Trash2}   label="Trash"    destructive testid="bulk-delete" />
          </>
        )}

        <span className="w-px h-5" style={{ background: 'var(--lux-border)' }} />
        <button onClick={onClear}
          className="w-7 h-7 rounded-full inline-flex items-center justify-center hover:bg-white/5"
          data-testid="bulk-clear">
          <X className="w-3.5 h-3.5" style={{ color: 'rgba(255,248,220,0.85)' }} />
        </button>
      </motion.div>
    )}
  </AnimatePresence>
);

const BulkBtn = ({ icon: Icon, label, onClick, destructive, testid }) => (
  <button onClick={onClick} data-testid={testid}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all"
    style={destructive
      ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#EF6E6E' }
      : { background: 'rgba(255,248,220,0.06)', border: '1px solid var(--lux-border)', color: 'rgba(255,248,220,0.85)' }}
  >
    <Icon className="w-3.5 h-3.5" /> {label}
  </button>
);

export default BulkActionBar;

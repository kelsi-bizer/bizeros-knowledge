import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';

type DialogRequest =
  | {
      kind: 'prompt';
      title: string;
      message: string | null;
      defaultValue: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      resolve: (value: boolean) => void;
    }
  | {
      kind: 'alert';
      title: string;
      message: string;
      resolve: () => void;
    };

interface DialogApi {
  prompt(title: string, options?: { defaultValue?: string; message?: string }): Promise<string | null>;
  confirm(message: string, options?: { title?: string }): Promise<boolean>;
  alert(message: string, options?: { title?: string }): Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  const prompt = useCallback<DialogApi['prompt']>((title, options = {}) => {
    return new Promise<string | null>((resolve) => {
      setRequest({
        kind: 'prompt',
        title,
        message: options.message ?? null,
        defaultValue: options.defaultValue ?? '',
        resolve
      });
    });
  }, []);

  const confirm = useCallback<DialogApi['confirm']>((message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      setRequest({
        kind: 'confirm',
        title: options.title ?? 'Confirm',
        message,
        resolve
      });
    });
  }, []);

  const alert = useCallback<DialogApi['alert']>((message, options = {}) => {
    return new Promise<void>((resolve) => {
      setRequest({
        kind: 'alert',
        title: options.title ?? 'Notice',
        message,
        resolve
      });
    });
  }, []);

  const finish = useCallback(
    (value: unknown) => {
      if (!request) return;
      switch (request.kind) {
        case 'prompt':
          request.resolve(value as string | null);
          break;
        case 'confirm':
          request.resolve(Boolean(value));
          break;
        case 'alert':
          request.resolve();
          break;
      }
      setRequest(null);
    },
    [request]
  );

  return (
    <DialogContext.Provider value={{ prompt, confirm, alert }}>
      {children}
      {request && <DialogHost request={request} onFinish={finish} />}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider');
  return ctx;
}

interface DialogHostProps {
  request: DialogRequest;
  onFinish: (value: unknown) => void;
}

function DialogHost({ request, onFinish }: DialogHostProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState(request.kind === 'prompt' ? request.defaultValue : '');

  useEffect(() => {
    setDraft(request.kind === 'prompt' ? request.defaultValue : '');
  }, [request]);

  useEffect(() => {
    const target = request.kind === 'prompt' ? inputRef.current : cancelRef.current;
    target?.focus();
    if (request.kind === 'prompt' && inputRef.current) {
      inputRef.current.select();
    }
  }, [request]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (request.kind === 'prompt') onFinish(null);
        else if (request.kind === 'confirm') onFinish(false);
        else onFinish(undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, onFinish]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (request.kind === 'prompt') onFinish(draft);
    else if (request.kind === 'confirm') onFinish(true);
    else onFinish(undefined);
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={request.title}>
      <form className="dialog" onSubmit={submit}>
        <h3 className="dialog-title">{request.title}</h3>
        {request.kind === 'prompt' && request.message && (
          <p className="dialog-message">{request.message}</p>
        )}
        {request.kind !== 'prompt' && <p className="dialog-message">{request.message}</p>}
        {request.kind === 'prompt' && (
          <input
            ref={inputRef}
            className="dialog-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        )}
        <div className="dialog-actions">
          {request.kind !== 'alert' && (
            <button
              ref={cancelRef}
              type="button"
              className="dialog-button dialog-button-cancel"
              onClick={() =>
                onFinish(request.kind === 'prompt' ? null : false)
              }
            >
              Cancel
            </button>
          )}
          <button type="submit" className="dialog-button dialog-button-confirm">
            {request.kind === 'alert' ? 'OK' : request.kind === 'confirm' ? 'Confirm' : 'OK'}
          </button>
        </div>
      </form>
    </div>
  );
}

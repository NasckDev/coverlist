import { useEffect, useRef, useState } from "react";
import { fold, type LayoutKey } from "../lib/design";
import { encodeShare, shareUrl } from "../share/codec";
import { drawShare, loadImages, type Images, type ShareContent, type ShareFormat } from "../share/draw";
import { Icon } from "./icons";

const FONT_WAIT_MS = 1500;

function fileName(name: string, format: ShareFormat) {
  const slug = fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "playlist";
  return `coverlist-${slug}-${format === "square" ? "quadrado" : "story"}.png`;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, "image/png");
    } catch {
      resolve(null);
    }
  });
}

/** Diálogo de compartilhar: imagem story/quadrado (baixar ou Web Share) e link que reabre a playlist. */
export function ShareDialog({ open, onClose, content, layout }: { open: boolean; onClose: () => void; content: ShareContent; layout: LayoutKey }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [format, setFormat] = useState<ShareFormat>("story");
  const [note, setNote] = useState("");
  const [images, setImages] = useState<Images>(new Map());
  const [link, setLink] = useState("");
  const [canSend, setCanSend] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    } else if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open]);

  // Clique no fundo (fora do conteúdo) fecha, como no protótipo; Esc já é nativo do <dialog>.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => e.target === el && onClose();
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [onClose]);

  // Ao abrir: espera as fontes (até 1,5 s), carrega as capas que aparecem e monta o link.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setNote("");
    setLink("");
    const visible = content.tracks.slice(0, 12);
    const current = content.tracks[content.current];
    const fonts = document.fonts
      ? Promise.race([
          Promise.all([document.fonts.load('600 100px "Bricolage Grotesque"'), document.fonts.load('500 30px "Hanken Grotesk"')]),
          new Promise((r) => setTimeout(r, FONT_WAIT_MS)),
        ]).catch(() => undefined)
      : Promise.resolve();
    void Promise.all([fonts, loadImages(current && !visible.includes(current) ? [...visible, current] : visible)]).then(([, imgs]) => {
      if (alive) setImages(imgs);
    });
    encodeShare({ ...content, layout })
      .then((payload) => alive && setLink(shareUrl(payload)))
      .catch(() => alive && setLink(""));
    try {
      setCanSend(!!navigator.canShare && navigator.canShare({ files: [new File([""], "a.png", { type: "image/png" })] }));
    } catch {
      setCanSend(false);
    }
    return () => {
      alive = false;
    };
  }, [open, content, layout]);

  useEffect(() => {
    if (open && canvas.current) drawShare(canvas.current, content, format, images);
  }, [open, content, format, images]);

  const blob = async () => {
    const cv = canvas.current;
    if (!cv) return null;
    const result = await toBlob(cv);
    if (result) return result;
    // Canvas contaminado por uma capa sem CORS: redesenha só com capas geradas.
    drawShare(cv, content, format, new Map());
    return toBlob(cv);
  };

  const download = async () => {
    setNote("Preparando a imagem…");
    const b = await blob();
    if (!b) return setNote("Não deu para gerar a imagem neste navegador.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = fileName(content.name, format);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setNote("Imagem baixada. Agora é só postar.");
  };

  const send = async () => {
    const b = await blob();
    if (!b) return;
    try {
      await navigator.share({ files: [new File([b], fileName(content.name, format), { type: "image/png" })], title: content.name });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setNote("Não deu para abrir o compartilhamento. Baixe a imagem e envie pelo app.");
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copiado. Quem abrir vê a mesma playlist, com as mesmas faixas.");
    } catch {
      setNote("Não deu para copiar automaticamente. Selecione o link e copie.");
    }
  };

  return (
    <dialog className="share" ref={dialog} aria-labelledby="share-title" onClose={onClose}>
      <div className="share-in">
        <div className="share-prev">
          <canvas ref={canvas} width={1080} height={1920} role="img" aria-label={`Prévia da imagem em formato ${format === "story" ? "story 9:16" : "quadrado 1:1"}`} />
        </div>
        <div className="share-side">
          <div className="share-top">
            <h2 id="share-title">Compartilhar a playlist</h2>
            <button type="button" className="icon" aria-label="Fechar" onClick={onClose}>
              <Icon.x />
            </button>
          </div>
          <p>Gera uma imagem com o nome, as faixas e o vinil na cor do selo.</p>
          <div className="opts" role="group" aria-label="Formato da imagem">
            {(["story", "square"] as const).map((f) => (
              <button key={f} type="button" className="opt" aria-pressed={format === f} onClick={() => setFormat(f)}>
                <i className={`ar ar-${f}`} aria-hidden="true" />
                <span>
                  <b>{f === "story" ? "Story" : "Quadrado"}</b>
                  <small>{f === "story" ? "9:16, para Instagram e status do WhatsApp" : "1:1, para feed e conversas"}</small>
                </span>
              </button>
            ))}
          </div>
          <label className="field" style={{ width: "100%" }}>
            <span>Link da playlist</span>
            <input readOnly value={link || "Gerando o link…"} onFocus={(e) => e.currentTarget.select()} data-testid="share-link" />
          </label>
          <p aria-live="polite">{note}</p>
          <div className="share-actions">
            <button type="button" className="solid" onClick={download}>
              <Icon.download />
              Baixar imagem
            </button>
            <button type="button" className="ghost" onClick={copy} disabled={!link}>
              Copiar link
            </button>
            {canSend && (
              <button type="button" className="ghost" onClick={send}>
                Enviar para um app
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

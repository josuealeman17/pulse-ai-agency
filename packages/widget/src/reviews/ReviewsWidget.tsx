import { useEffect, useState } from "react";
import { fetchReviews, type PublicReview, type ReviewsData, type ReviewsSettings } from "./reviewsApi.js";

const Star = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className={filled ? "star-full" : "star-empty"} aria-hidden="true">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

function Stars({ rating, large }: { rating: number; large?: boolean }) {
  const rounded = Math.round(rating);
  return (
    <span className={`stars${large ? " lg" : ""}`} role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= rounded} />
      ))}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "★";
}

function Card({ r }: { r: PublicReview }) {
  return (
    <div className="card">
      <Stars rating={r.starRating} />
      <p className="comment">{r.comment}</p>
      {r.reply && (
        <div className="reply">
          <span className="reply-label">Response from the owner</span>
          {r.reply}
        </div>
      )}
      <div className="who">
        <div className="avatar">{initial(r.reviewerName)}</div>
        <div>
          <div className="name">{r.reviewerName}</div>
          {formatDate(r.reviewedAt) && <div className="date">{formatDate(r.reviewedAt)}</div>}
        </div>
      </div>
    </div>
  );
}

export function ReviewsWidget({ settings }: { settings: ReviewsSettings }) {
  const [data, setData] = useState<ReviewsData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    fetchReviews(settings)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [settings]);

  if (state === "loading") {
    return (
      <div className="wrap">
        <div className="grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="wrap">
        <div className="error">Reviews are temporarily unavailable.</div>
      </div>
    );
  }

  const reviews = data?.reviews ?? [];

  return (
    <div className="wrap">
      <div className="summary">
        <div className="avg">{data?.averageRating ? data.averageRating.toFixed(1) : "—"}</div>
        <div className="meta">
          <Stars rating={data?.averageRating ?? 0} large />
          <span className="count">
            {reviews.length > 0
              ? `Based on ${data?.total} recent review${data?.total === 1 ? "" : "s"}`
              : "No reviews yet"}
          </span>
        </div>
        {data?.googleReviewUrl && (
          <a className="cta" href={data.googleReviewUrl} target="_blank" rel="noreferrer">
            Leave a review
          </a>
        )}
      </div>

      {reviews.length === 0 ? (
        <div className="empty">Be the first to leave a review!</div>
      ) : (
        <div className="grid">
          {reviews.map((r) => (
            <Card key={r.id} r={r} />
          ))}
        </div>
      )}

      <div className="badge">
        ⚡ Powered by <a href="https://pulse.ai" target="_blank" rel="noreferrer">Pulse</a>
      </div>
    </div>
  );
}

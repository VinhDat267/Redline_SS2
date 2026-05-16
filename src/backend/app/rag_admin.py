from __future__ import annotations

import argparse
import json

from app.core.database import SessionLocal
from app.services.rag_maintenance import collect_rag_health, reembed_document_blocks


def main() -> None:
    parser = argparse.ArgumentParser(description="RAG embedding maintenance utilities.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    health_parser = subparsers.add_parser("health", help="Check RAG embedding and pgvector health.")
    health_parser.add_argument("--strict", action="store_true", help="Exit non-zero when stale blocks remain.")

    reembed_parser = subparsers.add_parser("reembed", help="Rebuild DocumentBlock embeddings.")
    reembed_parser.add_argument("--force", action="store_true", help="Rebuild all blocks, not only stale/missing ones.")
    reembed_parser.add_argument("--limit", type=int, default=None, help="Maximum number of blocks to scan.")
    reembed_parser.add_argument("--dry-run", action="store_true", help="Report work without writing changes.")
    reembed_parser.add_argument(
        "--allow-fallback",
        action="store_true",
        help="Allow local-hash fallback to overwrite blocks when the configured provider fails.",
    )

    args = parser.parse_args()

    with SessionLocal() as session:
        if args.command == "health":
            report = collect_rag_health(session)
            print(json.dumps(report.to_dict(), indent=2, sort_keys=True))
            if args.strict and not report.healthy:
                raise SystemExit(1)
            return

        if args.command == "reembed":
            summary = reembed_document_blocks(
                session,
                force=args.force,
                limit=args.limit,
                dry_run=args.dry_run,
                allow_fallback=args.allow_fallback,
            )
            print(json.dumps(summary.to_dict(), indent=2, sort_keys=True))
            if summary.failed:
                raise SystemExit(1)
            return

    raise SystemExit(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    main()

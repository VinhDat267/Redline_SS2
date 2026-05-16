from __future__ import annotations

from sqlalchemy import JSON
from sqlalchemy.types import TypeDecorator

from pgvector.sqlalchemy import VECTOR


class EmbeddingVectorType(TypeDecorator):
    impl = JSON
    cache_ok = True
    comparator_factory = VECTOR.comparator_factory

    def __init__(self, dimensions: int, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.dimensions = dimensions

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(VECTOR(self.dimensions))
        return dialect.type_descriptor(JSON())

"""add token_version to users for JWT revocation

Revision ID: d5e6f7a8b9c0
Revises: c1b2a3d4e5f6
Create Date: 2026-07-20

Adds a per-user token version embedded in issued JWTs. Bumped on password
change so previously-issued tokens stop validating — without it a stolen
token stayed valid for up to 30 days and changing the password did nothing
to evict the attacker.

Existing tokens carry no `tv` claim and are read as version 0, which matches
this column's default, so live sessions survive the rollout.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, None] = 'c1b2a3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'token_version',
            sa.Integer(),
            nullable=False,
            server_default='0',
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'token_version')

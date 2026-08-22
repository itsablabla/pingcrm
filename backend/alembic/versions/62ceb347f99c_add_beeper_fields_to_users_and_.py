"""add beeper fields to users and contacts

Revision ID: 62ceb347f99c
Revises: d5e6f7a8b9c0
Create Date: 2026-04-12 10:04:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '62ceb347f99c'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('beeper_connected', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('beeper_last_synced_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('beeper_full_backfill_complete', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('contacts', sa.Column('beeper_user_id', sa.String(), nullable=True))
    op.add_column('contacts', sa.Column('beeper_display_name', sa.String(), nullable=True))
    op.add_column('contacts', sa.Column('beeper_chat_id', sa.String(), nullable=True))
    op.add_column('contacts', sa.Column('beeper_network', sa.String(), nullable=True))
    op.create_index(op.f('ix_contacts_beeper_user_id'), 'contacts', ['beeper_user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_contacts_beeper_user_id'), table_name='contacts')
    op.drop_column('contacts', 'beeper_network')
    op.drop_column('contacts', 'beeper_chat_id')
    op.drop_column('contacts', 'beeper_display_name')
    op.drop_column('contacts', 'beeper_user_id')
    op.drop_column('users', 'beeper_full_backfill_complete')
    op.drop_column('users', 'beeper_last_synced_at')
    op.drop_column('users', 'beeper_connected')

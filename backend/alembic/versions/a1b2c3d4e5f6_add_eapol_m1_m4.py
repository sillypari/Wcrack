"""Add EAPOL M1-M4 fields to captures

Revision ID: a1b2c3d4e5f6
Revises: 5227f3e24895
Create Date: 2026-06-04 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '5227f3e24895'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('captures', sa.Column('eapolM1', sa.Boolean(), nullable=False, server_default=sa.text('0')))
    op.add_column('captures', sa.Column('eapolM2', sa.Boolean(), nullable=False, server_default=sa.text('0')))
    op.add_column('captures', sa.Column('eapolM3', sa.Boolean(), nullable=False, server_default=sa.text('0')))
    op.add_column('captures', sa.Column('eapolM4', sa.Boolean(), nullable=False, server_default=sa.text('0')))


def downgrade() -> None:
    op.drop_column('captures', 'eapolM4')
    op.drop_column('captures', 'eapolM3')
    op.drop_column('captures', 'eapolM2')
    op.drop_column('captures', 'eapolM1')

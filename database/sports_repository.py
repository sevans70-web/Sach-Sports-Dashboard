"""
Repository for working with sports in the Sach Sports Platform.
"""

from database.connection import supabase


def get_all_sports():
    """
    Retrieve all sports from the database.
    """
    response = (
        supabase.table("sports")
        .select("*")
        .order("name")
        .execute()
    )

    return response.data

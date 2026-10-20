def chunk_text(text, chunk_size=500):
    """
    Split text into chunks of a given number of words.
    
    Parameters:
        text (str): Text to split
        chunk_size (int): Number of words per chunk
    
    Returns:
        List[str]: List of chunks
    """
    words = text.split()
    return [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]
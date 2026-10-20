from sentence_transformers import SentenceTransformer
import numpy as np
import faiss

embedder = SentenceTransformer("all-MiniLM-L6-v2")

def build_faiss_index(chunks):
    # Explicitly enable truncation to remove warnings
    embeddings = embedder.encode(chunks, convert_to_numpy=True, truncation=True)
    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(np.array(embeddings))
    return index, embeddings, chunks

def retrieve_chunks(query, index, embeddings, chunks, top_k=5):
    q_emb = embedder.encode([query], truncation=True)
    D, I = index.search(np.array(q_emb), top_k)
    return [chunks[i] for i in I[0]]
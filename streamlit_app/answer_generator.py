# studymate/answer_generator.py
# Q&A generation using IBM Granite with a safe download fallback.

from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline

MODEL_NAME = "ibm-granite/granite-3.3-2b-instruct"

# Force a fresh download if a cached shard is incomplete or missing.
# local_files_only=False ensures Hugging Face will re-fetch any broken files.
tokenizer = AutoTokenizer.from_pretrained(
    MODEL_NAME,
    local_files_only=False
)

model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    local_files_only=False
)

# Build a simple text-generation pipeline
qa_pipeline = pipeline(
    "text-generation",
    model=model,
    tokenizer=tokenizer
)

def generate_answer(relevant_chunks, question):
    """
    Generate an answer using IBM Granite model.
    relevant_chunks : list of text chunks retrieved from FAISS
    question        : user question string
    """
    context = "\n".join(relevant_chunks)
    prompt = (
        f"Use the following context to answer the question.\n\n"
        f"Context:\n{context}\n\nQuestion: {question}\nAnswer:"
    )

    # Add truncation=True to avoid warnings about max_length
    output = qa_pipeline(
        prompt,
        max_length=512,
        truncation=True,
        do_sample=False
    )
    return output[0]["generated_text"]

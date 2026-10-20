import streamlit as st
from pathlib import Path
from pdf_processor import extract_and_chunk
from semantic_search import build_faiss_index, retrieve_chunks
from answer_generator import generate_answer

# Extra imports for new features
import matplotlib.pyplot as plt
from deep_translator import GoogleTranslator
import pyflowchart

st.set_page_config(page_title="StudyMate", page_icon="📚", layout="wide")
st.title("📚 StudyMate – Multifunction Study Tool")

# ── Sidebar navigation ────────────────────────────────
tool = st.sidebar.radio(
    "Choose a feature:",
    [
        "PDF Q&A",
        "Flow Chart",
        "Translator",
        "Graph Plotter",
        "Quiz Generator",
    ],
)

# =======================================================
# 1️⃣  PDF Q&A  (existing feature)
# =======================================================
if tool == "PDF Q&A":
    uploaded_files = st.file_uploader(
        "Upload one or more PDF study materials", type="pdf", accept_multiple_files=True
    )
    question = st.text_input("Ask a question based on the uploaded PDFs:")
    if st.button("Get Answer"):
        if not uploaded_files:
            st.error("Please upload at least one PDF.")
        elif not question.strip():
            st.error("Please enter a question.")
        else:
            with st.spinner("Processing PDFs…"):
                docs_chunks = [extract_and_chunk(f) for f in uploaded_files]
                all_chunks = [chunk for doc in docs_chunks for chunk in doc]
                index, embeddings, text_chunks = build_faiss_index(all_chunks)
                relevant_chunks = retrieve_chunks(
                    query=question,
                    index=index,
                    embeddings=embeddings,
                    chunks=text_chunks,
                    top_k=5,
                )
            with st.spinner("Generating answer…"):
                answer = generate_answer(relevant_chunks, question)
            st.subheader("Answer")
            st.write(answer)

# =======================================================
# 2️⃣ Flow Chart Generator
# =======================================================
elif tool == "Flow Chart":
    st.subheader("Flowchart from Python Code")
    st.caption("⚠️ Enter valid Python code only. Pseudocode or plain English is not supported.")
    code_input = st.text_area("Enter Python code:")

    if st.button("Generate Flowchart"):
        if code_input.strip():
            try:
                # Attempt to create flowchart
                flow = pyflowchart.Flowchart.from_code(code_input)
                st.code(flow.flowchart(), language="mermaid")
                st.info("Copy the above Mermaid code into a Mermaid live editor to view the diagram.")
            except SyntaxError as e:
                st.error(f"Syntax Error: Your input is not valid Python code.\n{e}")
            except Exception as e:
                st.error(f"Could not generate flowchart: {e}")
        else:
            st.warning("Please enter some Python code.")

# =======================================================
# 3️⃣ Translator  (FIXED to use deep_translator)
# =======================================================
elif tool == "Translator":
    st.subheader("Translate Text")
    text = st.text_area("Enter text to translate:")
    target = st.text_input("Target language code (e.g. 'fr' for French, 'te' for Telugu):")
    if st.button("Translate"):
        if text and target:
            try:
                translated = GoogleTranslator(source="auto", target=target).translate(text)
                st.success(f"Translated Text ({target}):")
                st.write(translated)
            except Exception as e:
                st.error(f"Translation failed: {e}")
        else:
            st.warning("Enter text and target language code.")

# =======================================================
# 4️⃣ Graph Plotter
# =======================================================
elif tool == "Graph Plotter":
    st.subheader("Quick Graph Plot")
    x_values = st.text_input("X values (comma separated): e.g. 1,2,3,4")
    y_values = st.text_input("Y values (comma separated): e.g. 2,4,6,8")
    if st.button("Plot Graph"):
        try:
            x = [float(i) for i in x_values.split(",")]
            y = [float(i) for i in y_values.split(",")]
            fig, ax = plt.subplots()
            ax.plot(x, y, marker="o")
            ax.set_xlabel("X")
            ax.set_ylabel("Y")
            ax.set_title("Custom Graph")
            st.pyplot(fig)
        except Exception as e:
            st.error(f"Error plotting graph: {e}")

# =======================================================
# 5️⃣ Quiz Generator
# =======================================================
elif tool == "Quiz Generator":
    st.subheader("Generate Simple Quiz")
    topic_text = st.text_area("Paste study text to create a quiz:")
    num_qs = st.number_input("Number of questions", 1, 10, 5)
    if st.button("Generate Quiz"):
        if topic_text.strip():
            # very simple heuristic question generator
            sentences = [s.strip() for s in topic_text.split(".") if len(s.split()) > 5]
            st.write("### Quiz")
            for i, s in enumerate(sentences[:num_qs], 1):
                st.write(f"{i}. {s.replace('is', '____').replace('are', '____')} ?")
        else:
            st.warning("Please provide some text to generate quiz from.")

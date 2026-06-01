import chromadb

def limpiar_coleccion():
    try:
        client = chromadb.HttpClient(host='chromadb', port=8000)
        # Cambia 'electrical' por el nombre exacto de tu coleccion si usas otra
        client.delete_collection("electrical")
        print("✅ Colección 'electrical' eliminada con éxito de ChromaDB.")
        
        # La volvemos a crear vacía para que el backend no tire error al arrancar
        client.create_collection("electrical")
        print("🆕 Colección 'electrical' recreada vacía y lista para usar.")
    except Exception as e:
        print(f"❌ Error al limpiar ChromaDB: {e}")

if __name__ == "__main__":
    limpiar_coleccion()
import sys
from utils.llm import chat_completion
from config import MODELS, TEMPERATURE, MAX_TOKENS

try:
    stream = chat_completion(
        model=MODELS["advisor"],
        temperature=TEMPERATURE["advisor"],
        messages=[{"role": "system", "content": "You are a helpful assistant. Please reply in JSON. Example: {\"message\": \"hi\"}"}, {"role": "user", "content": "Hello"}],
        max_tokens=MAX_TOKENS["advisor"],
        response_format={"type": "json_object"},
        stream=True,
    )
    for chunk in stream:
        print(chunk.choices[0].delta.content or "", end="")
except Exception as e:
    print("ERROR:", type(e), e)
    sys.exit(1)

"""Only provider-reported nonnegative counts; unknown never becomes zero."""
def value(source: object, name: str) -> object:
    return source.get(name) if isinstance(source, dict) else getattr(source, name, None)


def count(source: object, name: str) -> int | None:
    result = value(source, name)
    return result if type(result) is int and result >= 0 else None


def normalize(usage: object) -> dict[str, int | None]:
    input_tokens = count(usage, 'prompt_tokens')
    output_tokens = count(usage, 'completion_tokens')
    total = count(usage, 'total_tokens')
    if total is None and input_tokens is not None and output_tokens is not None:
        total = input_tokens + output_tokens
    return {
        'input_tokens': input_tokens, 'output_tokens': output_tokens, 'total_tokens': total,
        'cached_tokens': count(value(usage, 'prompt_tokens_details'), 'cached_tokens'),
        'reasoning_tokens': count(value(usage, 'completion_tokens_details'), 'reasoning_tokens'),
    }

"""Native TypeSafe System One request/response format."""


class SystemOneAdapter:
    protocol = 'systemone'

    @staticmethod
    def endpoint(base_url: str) -> str:
        value = base_url.rstrip('/')
        if value.endswith('/systemone'):
            return value
        return value + '/systemone'

    @staticmethod
    def models_endpoint(base_url: str) -> str:
        """Model list lives next to /systemone, not under it.

        A saved root such as https://api.typesafe.ai/v1 and a saved full call
        URL such as https://api.typesafe.ai/v1/systemone both probe
        https://api.typesafe.ai/v1/models.
        """
        value = base_url.rstrip('/')
        suffix = '/systemone'
        if value.endswith(suffix):
            value = value[:-len(suffix)]
        if value.endswith('/models'):
            return value
        return value + '/models'

    @staticmethod
    def build_payload(model_id: str, state: dict, question_id: str, question: dict) -> dict:
        return {'model': model_id, 'state': state, 'questions': {question_id: question}}

    @staticmethod
    def extract_answer(data: dict, question_id: str) -> dict:
        answers = data.get('answers')
        return answers.get(question_id) if isinstance(answers, dict) else None

    @staticmethod
    def model_name(data: dict, configured_model: str) -> str:
        value = data.get('model')
        return value.strip() if isinstance(value, str) and value.strip() else ''

    @staticmethod
    def usage(data: dict) -> dict | None:
        value = data.get('usage')
        return value if isinstance(value, dict) else None

    @staticmethod
    def usage_fields() -> tuple[str, str, str]:
        return 'input_tokens', 'output_tokens', 'total_tokens'

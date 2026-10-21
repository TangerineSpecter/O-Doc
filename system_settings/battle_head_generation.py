"""Role-labeled references and prompt for complete Agent battle sprites."""


def build_battle_head_request(arguments: dict, options: dict, agent=None) -> dict:
    data = dict(arguments)
    background_mode = data.pop('background_mode', 'flat')
    if background_mode not in ('flat', 'transparent'):
        raise ValueError('背景方式无效')
    pose_reference_id = data.pop('pose_reference_image_id', None) or data.pop('body_reference_image_id', None)
    appearance_override_id = data.pop('appearance_reference_image_id', None)
    use_agent_avatar = data.pop('use_agent_avatar', True)
    legacy_references = data.pop('reference_image_ids', [])
    references = []
    roles = []

    if options.get('supports_reference_images'):
        max_references = max(0, int(options.get('max_reference_images') or 0))
        if pose_reference_id:
            references.append(pose_reference_id)
            roles.append('battle pose template')

        agent_references = options.get('agent_reference_images', {})
        appearance_reference_id = (appearance_override_id or agent_references.get('full_body')
                                   or agent_references.get('avatar'))
        appearance_role = ('user-provided appearance and clothing reference' if appearance_override_id
                           else 'Agent full-body appearance and clothing reference' if agent_references.get('full_body')
                           else 'Agent avatar identity reference')
        if appearance_reference_id and len(references) < max_references:
            references.append(appearance_reference_id)
            roles.append(appearance_role)

        avatar_reference_id = agent_references.get('avatar') if use_agent_avatar else None
        if avatar_reference_id and avatar_reference_id not in references and len(references) < max_references:
            references.append(avatar_reference_id)
            roles.append('Agent avatar face and identity supplement')

        for legacy_reference in legacy_references:
            if legacy_reference not in references and len(references) < max_references:
                references.append(legacy_reference)
                roles.append('additional appearance reference')
        data['reference_image_ids'] = references
    elif pose_reference_id or appearance_override_id or legacy_references:
        raise ValueError('当前模型不支持参考图，请切换支持参考图的模型')

    user_prompt = str(data.get('prompt', '')).strip()
    reference_instructions = []
    if references:
        reference_instructions.append(
            'Attached reference order and roles: ' + '; '.join(
                f'IMAGE {index + 1} = {role}' for index, role in enumerate(roles)
            ) + '.'
        )
    else:
        reference_instructions.append('No images are attached; create an original character from the optional user requirements.')

    prompt = (
        'Create ONE complete, front-facing three-quarter RPG battle character sprite in a crisp retro pixel-art style. '
        'Show the entire character from the very top of all hair and accessories to the soles of both boots, with clear margin; '
        'preserve long hair below the shoulders without cropping. Use a compact chibi proportion, hard-edged chunky pixel clusters, '
        'a limited harmonious palette, thick clean dark outlines, and simple upper-left pixel shading. '
        'Use the exact full-body silhouette, body proportions, facing direction, battle-ready idle pose, head angle, expression, '
        'arm positions, and wrist locations from the battle pose template. The face must have open, alert eyes and a calm focused '
        'combat expression; do not copy a smile, closed eyes, wink, or other portrait expression from an avatar. '
        'Use the Agent appearance reference for recognizable identity, hair, colors, accessories, and especially outfit design; '
        'never copy the generic novice clothing from the pose template when a character appearance reference is supplied. '
        'Draw anatomically simple arms with sleeves ending at the same wrist positions as the pose template. Hands must be compact '
        'curled fists with short aligned fingers, not open palms, splayed fingers, waving/peace signs, or large bare hands. '
        'Keep the right wrist in a natural gripping pose around the template weapon handle and the left hand as a relaxed closed fist. '
        'The game overlays its own pixel-perfect hand and weapon layers, so avoid oversized or expressive hand gestures. '
        'Do not draw any weapon, additional equipment, text, frame, scene, floor, shadow, gradient, antialiasing, or blur. '
        + ('Output a PNG with a genuinely transparent alpha background, including all gaps enclosed by hair and arms. '
           'Do not paint a checkerboard or white background to simulate transparency. '
           if background_mode == 'transparent' else
           'Use a perfectly flat vivid magenta background (#FF00FF), including every gap between hair and arms, '
           'for background removal. Never use this background color inside the character. ')
        +
        'Keep the full character centered, with all hair ornaments, hair tips, hands, and feet safely inside the image. '
        'The reference image controls are: ' + ' '.join(reference_instructions)
    )
    if user_prompt:
        prompt += f'\n\nOptional outfit or appearance adjustments from the user: {user_prompt}'
    from .agent_role import role_text
    if agent is not None:
        prompt += '\n' + role_text(agent, 'image')
    data['prompt'] = prompt
    data['background_mode'] = background_mode
    return data
